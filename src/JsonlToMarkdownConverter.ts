import { readFileSync } from 'node:fs'
import type { Entry, Item, StateType } from './types.ts'
import { EntrySchema } from './types.ts'
import { assert } from './utils.ts'
import { basename } from 'node:path'
import { OutputFormatter, type FormatterContext } from './OutputFormatter.ts'
import { CommandParser } from './CommandParser.ts'

export class JsonlToMarkdownConverter {
  private itemTree = new Map<string, Item>()
  private entryList: string[] = []
  private toolUseTree = new Map<string, Entry[]>()
  private isDebug: boolean
  private metaEntry: Entry | null = null
  private lastTimestamp: string | null = null
  private firstUserPrompt: string | null = null
  private outputFormatter: OutputFormatter

  constructor(isDebug: boolean = false) {
    this.isDebug = isDebug
    // Create formatter with initial context (will be updated later with actual maps)
    this.outputFormatter = new OutputFormatter({
      toolUseTree: new Map(),
      itemTree: new Map(),
      defaultSaveOnly: false,
      isDebug: isDebug,
    })
  }

  convert(jsonlPath: string): { content: string; filename: string } | null {
    console.log(`Processing file: ${jsonlPath}`)
    this.reset()

    const entries = this.parseJsonlFile(jsonlPath)
    this.buildItemTree(entries)

    // Create new OutputFormatter with complete context
    this.outputFormatter = new OutputFormatter({
      toolUseTree: this.toolUseTree,
      itemTree: this.itemTree,
      defaultSaveOnly: false,
      isDebug: this.isDebug,
    })

    const markdownSections = this.processEntries()

    if (markdownSections.length === 0) {
      return null
    }

    // Generate header if we have meta information
    const header = this.generateHeader()
    if (header) {
      markdownSections.unshift(header)
    }

    const content = markdownSections.join('\n\n')
    const filename = this.generateFilename(jsonlPath)

    return { content, filename }
  }

  private reset() {
    this.itemTree.clear()
    this.toolUseTree.clear()
    this.entryList = []
    this.metaEntry = null
    this.lastTimestamp = null
    this.firstUserPrompt = null
  }

  private parseJsonlFile(
    jsonlPath: string,
  ): Array<{ entry: Entry; lineNumber: number }> {
    const content = readFileSync(jsonlPath, 'utf-8')
    const lines = content.trim().split('\n')
    const entries: Array<{ entry: Entry; lineNumber: number }> = []

    lines.forEach((line, index) => {
      if (!line.trim()) return

      const lineNumber = index + 1
      try {
        const entry: Entry = JSON.parse(line)

        if (!entry.uuid) {
          console.warn(
            `Skipping entry on line ${lineNumber} without UUID:`,
            JSON.stringify(entry, null, 2),
          )
          return
        }

        const validation = EntrySchema.safeParse(entry)
        if (!validation.success) {
          console.error(
            `Invalid entry format on line ${lineNumber}:`,
            JSON.stringify(entry, null, 2),
          )
          console.error(validation.error)
          process.exit(1)
        }

        entries.push({ entry, lineNumber })
      } catch (error) {
        console.error(`Failed to parse line ${lineNumber}:`, error)
      }
    })

    return entries
  }

  private buildItemTree(entries: Array<{ entry: Entry; lineNumber: number }>) {
    entries.forEach(({ entry, lineNumber }) => {
      assert(entry.uuid, `Entry on line ${lineNumber} is missing UUID`)

      // Capture first entry with cwd and timestamp for header
      if (!this.metaEntry && entry.cwd && entry.timestamp) {
        this.metaEntry = entry
      }

      // Track last timestamp
      if (entry.timestamp) {
        this.lastTimestamp = entry.timestamp
      }

      // Capture first user prompt (not command elements)
      if (!this.firstUserPrompt && entry.type === 'user' && !entry.isMeta) {
        const content = entry.message?.content
        if (typeof content === 'string') {
          const parser = new CommandParser(content)
          if (!parser.hasCommandElements()) {
            this.firstUserPrompt = content
          }
        } else if (Array.isArray(content)) {
          // Look for first text content that's not a command
          const textContent = content.find((c) => {
            if (c.type === 'text' && c.text) {
              const parser = new CommandParser(c.text)
              return !parser.hasCommandElements()
            }
            return false
          })
          if (textContent?.text) {
            this.firstUserPrompt = textContent.text
          }
        }
      }

      const state: StateType = entry.isMeta === true ? 'skipped' : 'pending'

      const item: Item = {
        uuid: entry.uuid,
        parentUuid: entry.parentUuid || null,
        lineNumber,
        state,
        entry,
      }

      this.itemTree.set(item.uuid, item)
      this.entryList.push(entry.uuid)

      // Build tool use/result relationships
      const toolUseId = this.getToolUseId(entry)
      if (toolUseId) {
        this.toolUseTree.set(toolUseId, [])
      }

      const toolUseResultId = this.getToolResultId(entry)
      if (toolUseResultId) {
        const existingResults = this.toolUseTree.get(toolUseResultId) || []
        existingResults.push(entry)
        this.toolUseTree.set(toolUseResultId, existingResults)

        if (existingResults.length > 1) {
          console.warn(
            'Found multiple tool results for tool_use_id:',
            toolUseResultId,
          )
        }
      }
    })
  }

  private processEntries(): string[] {
    const markdownSections: string[] = []

    console.log(`Processing ${this.entryList.length} entries...`)
    this.entryList.forEach((uuid) => {
      const item = this.itemTree.get(uuid)
      if (!item) {
        console.warn(`Entry with UUID ${uuid} not found in ItemTree`)
        return
      }

      if (item.state === 'skipped' || item.state === 'processed') {
        console.warn(
          `Line #${item.lineNumber} is already ${item.state}, skipping`,
        )
        return
      }

      item.state = 'processing'
      const markdown = this.processItem(item)

      if (markdown) {
        markdownSections.push(markdown)
      }
      item.state = 'processed'
    })

    return markdownSections
  }

  private processItem(item: Item): string | null {
    if (item.state === 'skipped' || item.state === 'processed') {
      console.warn(
        `Skipping item with UUID ${item.uuid} on line #${item.lineNumber} (state: ${item.state})`,
      )
      return null
    }

    const { entry, lineNumber } = item
    const output: string[] = []

    if (!entry.message || !entry.message.content) {
      console.warn(
        `Entry with UUID ${entry.uuid} has no message or content on line #${lineNumber}`,
      )
      return null
    }

    console.log(`#${lineNumber} ${entry.type}`)
    if (this.isDebug) {
      output.push(
        `## Line ${lineNumber} ${entry.type} (isSidechain: ${entry.isSidechain})`,
      )
    }

    // Handle sidechain user entries as assistant
    const entryType =
      entry.type === 'user' && entry.isSidechain ? 'assistant' : entry.type

    if (typeof entry.message.content === 'string') {
      const text = this.outputFormatter.formatTextContent(
        item,
        entry.message.content,
        entryType,
      )
      if (text) output.push(text)
    } else if (Array.isArray(entry.message.content)) {
      entry.message.content.forEach((contentItem, index) => {
        if (index > 0) output.push('')

        const formattedContent = this.outputFormatter.formatContentItem(
          item,
          contentItem,
          entryType,
        )
        if (formattedContent) output.push(formattedContent)
      })
    } else {
      output.push(`## Unknown ${entryType} line #${lineNumber}`)
      output.push('```json')
      output.push(JSON.stringify(entry, null, 2))
      output.push('```')
    }

    return output.length > 0 ? output.join('\n') : null
  }

  private getToolUseId(entry: Entry): string | null {
    const content = entry?.message?.content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === 'tool_use' && item.id) {
          return item.id
        }
      }
    }
    return null
  }

  private getToolResultId(entry: Entry): string | null {
    const content = entry?.message?.content
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item?.type === 'tool_result' && item.tool_use_id) {
          return item.tool_use_id
        }
      }
    }
    return null
  }

  private generateHeader(): string | null {
    if (!this.metaEntry || !this.metaEntry.cwd) {
      return null
    }

    const lines: string[] = [
      '# 🤖 Claude Code Transcript',
      `## 🗂️ ${this.outputFormatter.formatPath(this.metaEntry.cwd)}`,
    ]

    // Format timestamps
    if (this.metaEntry.timestamp) {
      const startTime = this.outputFormatter.formatTimestamp(this.metaEntry.timestamp)
      const endTime = this.lastTimestamp
        ? this.outputFormatter.formatTimestamp(this.lastTimestamp)
        : startTime
      lines.push(`🕒 ${startTime} - ${endTime}`)
    }
    lines.push(`Session ID: \`${this.metaEntry.sessionId}\``)
    return lines.join('\n')
  }

  private generateFilename(filePath: string): string {
    // Use meta entry timestamp or fallback to current date
    const timestamp = this.metaEntry?.timestamp || new Date().toISOString()
    const date = new Date(timestamp)

    // Format: YYYY-MM-DD_HH-MM-SSZ
    const dateStr = date
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z') // Remove milliseconds
      .replace(/:/g, '-') // Replace colons with hyphens
      .replace('T', '_') // Replace T with underscore

    // Get first 5 words from user prompt
    let promptPart = ''
    if (this.firstUserPrompt) {
      const words = this.firstUserPrompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove non-alphanumeric except spaces
        .trim()
        .split(/\s+/) // Split on whitespace
        .slice(0, 5) // Take first 5 words
        .join('-')

      if (words) {
        promptPart = `-${words}`
      }
    }

    return `${dateStr}${promptPart}_${basename(filePath).substring(0, 8)}.md`
  }
}
