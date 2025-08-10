import { readFileSync } from 'node:fs'
import type { Entry, Item, StateType } from './types.ts'
import { EntrySchema } from './types.ts'
import { CommandParser } from './CommandParser.ts'
import { ToolResultFormatter } from './ToolResultFormatter.ts'
import { assert, createImageFile } from './utils.ts'
import type { Content, ToolUseResult } from './types.ts'

export class JsonlToMarkdownConverter {
  private itemTree = new Map<string, Item>()
  private entryList: string[] = []
  private toolUseTree = new Map<string, Entry[]>()
  private isDebug: boolean

  constructor(isDebug: boolean = false) {
    this.isDebug = isDebug
  }

  convert(jsonlPath: string): string | null {
    console.log(`Processing file: ${jsonlPath}`)
    this.reset()

    const entries = this.parseJsonlFile(jsonlPath)
    this.buildItemTree(entries)

    const markdownSections = this.processEntries()

    return markdownSections.length > 0 ? markdownSections.join('\n\n') : null
  }

  private reset() {
    this.itemTree.clear()
    this.toolUseTree.clear()
    this.entryList = []
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
      const text = this.formatTextContent(
        item,
        entry.message.content,
        entryType,
      )
      if (text) output.push(text)
    } else if (Array.isArray(entry.message.content)) {
      entry.message.content.forEach((contentItem, index) => {
        if (index > 0) output.push('')

        const formattedContent = this.formatContentItem(
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

  private formatContentItem(
    item: Item,
    contentItem: Content,
    entryType: string,
  ): string | null {
    switch (contentItem.type) {
      case 'text':
        return contentItem.text
          ? this.formatTextContent(item, contentItem.text, entryType)
          : null
      case 'tool_use':
        return this.formatToolUse(item, contentItem)
      case 'image':
        return this.formatImage(item, contentItem)
      default:
        console.warn(
          `Unhandled content type "${contentItem.type}" on line #${item.lineNumber}`,
        )
        return null
    }
  }

  private formatTextContent(
    item: Item,
    text: string,
    entryType: string,
  ): string | null {
    if (text === '(no content)') {
      console.warn(`Skipping empty content on line #${item.lineNumber}`)
      return null
    }

    const output: string[] = []
    const parser = new CommandParser(text)
    if (parser.hasCommandElements()) {
      const parsed = parser.parse()
      if (parsed) output.push(...parsed)
    } else if (entryType === 'user') {
      output.push(...this.formatUserMessage(text))
    } else if (entryType === 'assistant') {
      // just output assistant messages as-is
      output.push(text)
    } else {
      output.push(
        `## Unknown entry type ${entryType} on line #${item.lineNumber}`,
      )
      output.push('```json')
      output.push(JSON.stringify(item.entry, null, 2))
      output.push('```')
    }

    return output.length > 0 ? output.join('\n') : null
  }

  private formatUserMessage(text: string): string[] {
    const output: string[] = []
    // user messages are rendered as blockquotes
    // add special notice for certain messages
    if (text.startsWith('[Request interrupted')) {
      output.push(`> [!WARNING]`)
    } else if (text.startsWith("Error: The user doesn't want to proceed")) {
      output.push(`> [!CAUTION]`)
    } else {
      output.push(`> [!IMPORTANT]`)
    }

    const lines = text.split('\n')
    output.push(...lines.map((line) => `> ${line}`))

    return output
  }

  private formatToolUse(item: Item, contentItem: Content): string {
    const output: string[] = []
    const toolName = contentItem.name || 'Unknown Tool'
    const description = this.getToolDescription(contentItem)

    output.push(
      `${this.getToolEmoji(toolName)} **${toolName}${description ? `: ${description}` : ''}**`,
    )

    if (contentItem.input?.command) {
      output.push(`\`\`\`shell\n${contentItem.input.command}\n\`\`\``)
    }
    if (contentItem.input?.prompt) {
      output.push(`\n${contentItem.input.prompt}`)
    }

    // Process tool results
    const toolUseId = contentItem.id || ''
    const toolResults = this.toolUseTree.get(toolUseId) || []

    toolResults.forEach((result, index) => {
      assert(result.uuid, 'Tool result entry is missing UUID')

      // separate multiple results with a blank line
      if (index > 0) output.push('')

      const resultItem = this.itemTree.get(result.uuid)
      if (!resultItem) {
        console.warn(
          `Tool result with UUID ${result.uuid} not found in ItemTree`,
        )
        return
      }

      if (result.toolUseResult) {
        const formattedResult = this.formatToolResult(
          toolName,
          resultItem,
          result.toolUseResult as ToolUseResult,
        )
        if (formattedResult) output.push(formattedResult)
      } else {
        output.push(
          `## Tool result for tool_use_id ${toolUseId} on line #${item.lineNumber} at line #${resultItem.lineNumber}`,
        )
        output.push('```json')
        output.push(JSON.stringify(result, null, 2))
        output.push('```')
      }
    })

    return output.join('\n')
  }

  private formatToolResult(
    toolName: string,
    resultItem: Item,
    toolUseResult: ToolUseResult,
  ): string {
    const output: string[] = []
    const formatter = new ToolResultFormatter(toolName, this.isDebug)

    if (this.isDebug) {
      output.push(
        `### Tool Use Result for ${toolName} on line #${resultItem.lineNumber} (isSidechain: ${resultItem.entry.isSidechain})`,
      )
    }

    const formatted = formatter.format(toolUseResult, resultItem)
    if (formatted) output.push(formatted)

    resultItem.state = 'processed'
    return output.join('\n')
  }

  private formatImage(item: Item, contentItem: Content): string | null {
    if (
      contentItem.type === 'image' &&
      contentItem.source &&
      contentItem.source.type === 'base64' &&
      typeof contentItem.source.data === 'string'
    ) {
      const filename = createImageFile(
        contentItem.source.data,
        contentItem.source.media_type,
        item.uuid,
      )
      return `![Image](contents/${filename})`
    }

    return [
      `## Unhandled image content on line #${item.lineNumber}`,
      '```json',
      JSON.stringify(contentItem, null, 2),
      '```',
    ].join('\n')
  }

  private getToolDescription(contentItem: Content): string {
    const input = contentItem.input
    if (!input) return ''

    if (input.pattern) return `\`"${input.pattern.replace(/\\/g, '\\')}"\``
    return input.description || input.path || input.file_path || input.url || ''
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

  private getToolEmoji(toolName: string): string {
    const emojiMap: { [key: string]: string } = {
      ls: '📂',
      read: '📖',
      write: '✍️',
      edit: '✏️',
      multiedit: '✏️',
      glob: '🔍',
      grep: '🔍',
      task: '📋',
      todowrite: '✅',
      bash: '💻',
      webfetch: '🌐',
    }
    return emojiMap[toolName.toLowerCase()] || '🛠️'
  }
}