import { writeFileSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { filterAnsi, truncateLine, escapeCodeFences, trimBlankLines, getLanguageFromExtension } from './utils.ts'

export class OutputFormatter {
  private defaultSaveOnly: boolean

  constructor(defaultSaveOnly: boolean) {
    this.defaultSaveOnly = defaultSaveOnly
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
      saveOnly = this.defaultSaveOnly,
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
      fileContent,
      filePath: effectiveFilePath,
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
}