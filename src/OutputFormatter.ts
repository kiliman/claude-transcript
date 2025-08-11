import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { CommandParser } from './CommandParser.ts'
import { ToolResultFormatter } from './ToolResultFormatter.ts'
import type { Content, Entry, Item, ToolUseResult } from './types.ts'
import {
  assert,
  createImageFile,
  escapeCodeFences,
  filterAnsi,
  getLanguageFromExtension,
  trimBlankLines,
  truncateLine,
} from './utils.ts'

export interface FormatterContext {
  toolUseTree: Map<string, Entry[]>
  itemTree: Map<string, Item>
  defaultSaveOnly: boolean
  isDebug: boolean
}

export class OutputFormatter {
  private context: FormatterContext

  constructor(context: FormatterContext) {
    this.context = context
  }

  format(options: {
    saveOnly?: boolean
    content: string
    fileContent?: string
    filePath?: string
    codeFence?: boolean
    label?: string
  }): string {
    const {
      saveOnly = this.context.defaultSaveOnly,
      content,
      fileContent,
      filePath,
      codeFence = true,
      label,
    } = options

    if (content.length === 0) return ''

    // Handle special cases
    if (content.startsWith('[Request interrupted')) {
      return `> [!WARNING]\n> ${content}`
    }
    if (content.startsWith("Error: The user doesn't want to proceed")) {
      return `> [!CAUTION]\n> ${content}`
    }

    const output: string[] = []
    if (label) output.push(label)

    // Determine if this is a diff file
    const effectiveFilePath = content.startsWith('diff --git')
      ? filePath || 'diff.patch'
      : filePath

    // Process content
    const processed = this.processContent({
      saveOnly,
      content,
      ...(fileContent !== undefined && { fileContent }),
      ...(effectiveFilePath !== undefined && { filePath: effectiveFilePath }),
      codeFence,
    })

    if (saveOnly) {
      output.push(`([view file](${processed.savedPath}))`)
    } else {
      if (codeFence) {
        const language = effectiveFilePath
          ? getLanguageFromExtension(effectiveFilePath)
          : ''
        output.push(`\`\`\`${language}`)
      }
      output.push(processed.content)
      if (codeFence) {
        output.push('```')
      }

      if (processed.savedPath) {
        const notice = processed.remainingLines
          ? `... +${processed.remainingLines} lines `
          : ''
        output.push(`${notice}([view file](${processed.savedPath}))`)
      }
    }

    return output.join('\n')
  }

  private processContent(options: {
    saveOnly: boolean
    content: string
    fileContent?: string
    filePath?: string
    codeFence: boolean
  }): { content: string; savedPath?: string; remainingLines?: number } {
    const {
      saveOnly,
      content,
      fileContent = content,
      filePath,
      codeFence,
    } = options

    let truncatedLineCount = 0
    const lines = content
      .split('\n')
      .map((line) => filterAnsi(line))
      .map((line) => {
        if (!codeFence) return line
        const truncated = truncateLine(line, 120)
        if (truncated !== line) truncatedLineCount++
        return truncated
      })

    const lineCount = lines.length

    // Return as-is if small enough and no truncation needed
    if (!saveOnly && lineCount <= 12 && !truncatedLineCount) {
      const processedContent = codeFence
        ? escapeCodeFences(trimBlankLines(lines).join('\n'))
        : lines.join('\n')
      return { content: processedContent }
    }

    // Save to file
    const savedPath = this.saveToFile(fileContent, filePath)
    const truncatedLines = lines.slice(0, 8)
    const remainingLines = Math.max(0, lineCount - 8)

    const processedContent = codeFence
      ? escapeCodeFences(trimBlankLines(truncatedLines).join('\n'))
      : truncatedLines.join('\n')

    return {
      content: processedContent,
      savedPath,
      remainingLines,
    }
  }

  private saveToFile(content: string, filePath?: string): string {
    const hash = createHash('md5').update(content).digest('hex').substring(0, 8)

    let extension = ''
    let baseFileName = 'results'

    if (filePath) {
      const ext = filePath.split('.').pop()
      if (ext && ext !== filePath) {
        extension = `.${ext}`
      }
      baseFileName = basename(filePath, extension).replace(
        /[^a-zA-Z0-9-_]/g,
        '_',
      )
    }

    const filename = `${baseFileName}-${hash}${extension}`
    const savedPath = join('.claude-transcripts/contents', filename)

    writeFileSync(savedPath, content, 'utf-8')

    return join('contents', filename)
  }

  formatTextContent(
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

  formatUserMessage(text: string): string[] {
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

  formatContentItem(
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

  formatToolUse(item: Item, contentItem: Content): string {
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
    const toolResults = this.context?.toolUseTree.get(toolUseId) || []

    toolResults.forEach((result, index) => {
      assert(result.uuid, 'Tool result must have a UUID')
      // separate multiple results with a blank line
      if (index > 0) output.push('')

      const resultItem = this.context?.itemTree.get(result.uuid)
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

  formatToolResult(
    toolName: string,
    resultItem: Item,
    toolUseResult: ToolUseResult,
  ): string {
    const output: string[] = []
    const formatter = new ToolResultFormatter(toolName, this)

    if (this.context.isDebug) {
      output.push(
        `### Tool Use Result for ${toolName} on line #${resultItem.lineNumber} (isSidechain: ${resultItem.entry.isSidechain})`,
      )
    }

    const formatted = formatter.format(toolUseResult, resultItem)
    if (formatted) output.push(formatted)

    resultItem.state = 'processed'
    return output.join('\n')
  }

  formatImage(item: Item, contentItem: Content): string | null {
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

  getToolDescription(contentItem: Content): string {
    const input = contentItem.input
    if (!input) return ''

    if (input.pattern) return `\`"${input.pattern.replace(/\\/g, '\\')}"\``
    return input.description || input.path || input.file_path || input.url || ''
  }

  getToolEmoji(toolName: string): string {
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

  formatPath(cwd: string): string {
    // Replace user home directory with ~
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || ''
    if (homeDir && cwd.startsWith(homeDir)) {
      return cwd.replace(homeDir, '~')
    }
    return cwd
  }

  formatTimestamp(timestamp: string): string {
    // Convert ISO timestamp to readable format without T and Z
    const date = new Date(timestamp)
    return date
      .toISOString()
      .replace(/\.\d{3}Z$/, '') // Remove milliseconds and Z
      .replace('T', ' ') // Replace T with space
  }
}
