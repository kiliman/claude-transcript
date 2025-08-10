import type {
  Content,
  File,
  Item,
  StructuredPatch,
  Todo,
  ToolUseResult,
} from './types.ts'
import { OutputFormatter } from './OutputFormatter.ts'

export class ToolResultFormatter {
  private toolName: string
  private isDebug: boolean

  constructor(toolName: string, isDebug: boolean) {
    this.toolName = toolName
    this.isDebug = isDebug
  }

  format(toolUseResult: ToolUseResult, resultItem: Item): string | null {
    if (typeof toolUseResult !== 'object') {
      return this.formatOutput({ content: toolUseResult })
    }
    // ignore "grep" or "glob" tool results, they are too noisy
    if (
      this.toolName.toLowerCase() === 'grep' ||
      this.toolName.toLowerCase() === 'glob'
    ) {
      return null
    }

    // Handle file-based results
    if (toolUseResult.file) {
      return this.formatFileResult(toolUseResult.file)
    }
    if (toolUseResult.filePath && typeof toolUseResult.content === 'string') {
      return this.formatFileResult({
        content: toolUseResult.content,
        filePath: toolUseResult.filePath,
        numLines: 0,
        startLine: 0,
        totalLines: 0,
      })
    }

    // Handle specific tool types
    if (toolUseResult.filenames && toolUseResult.filenames.length > 0) {
      return this.formatOutput({ content: toolUseResult.filenames.join('\n') })
    }
    if (this.toolName.toLowerCase() === 'todowrite' && toolUseResult.newTodos) {
      return this.formatTodos(toolUseResult.newTodos)
    }
    if (toolUseResult.stdout !== undefined && toolUseResult.isImage === false) {
      if (toolUseResult.stdout.length === 0) return ''
      return this.formatOutput({ content: toolUseResult.stdout })
    }
    if (toolUseResult.url && toolUseResult.result) {
      return this.formatOutput({
        content: `\n### Results\n${toolUseResult.result}`,
        codeFence: false,
      })
    }
    if (toolUseResult.structuredPatch && toolUseResult.filePath) {
      return this.formatPatch(
        toolUseResult.filePath,
        toolUseResult.structuredPatch,
      )
    }
    if (typeof toolUseResult.content === 'string') {
      return this.formatContent(toolUseResult.content, resultItem)
    }

    // Fallback
    return this.formatOutput({
      content: JSON.stringify(toolUseResult, null, 2),
      label: `Tool Use Result: UNKNOWN Line ${resultItem.lineNumber}`,
    })
  }

  private formatFileResult(file: File): string {
    return this.formatOutput({
      saveOnly: this.shouldSaveOnly(),
      content: file.content,
      filePath: file.filePath,
    })
  }

  private formatTodos(todos: Todo[]): string {
    return todos
      .map((todo) => {
        const checked = todo.status === 'completed' ? 'x' : ' '
        const inProgress = todo.status === 'in_progress' ? ' ⏳' : ''
        const priority = todo.priority === 'high' ? '⚡️' : ''
        return `- [${checked}]${inProgress} ${todo.content} ${priority}`
      })
      .join('\n')
  }

  private formatPatch(
    filePath: string,
    structuredPatch: StructuredPatch[],
  ): string {
    const content = this.convertDiff(structuredPatch)
    const fileContent = this.convertToGitDiff(filePath, structuredPatch)

    return this.formatOutput({
      saveOnly: this.shouldSaveOnly(),
      content,
      fileContent,
      filePath: `${filePath}.patch`,
    })
  }

  private formatContent(
    content: Content | Content[] | string,
    resultItem: Item,
  ): string {
    if (typeof content === 'string') {
      return this.formatOutput({ saveOnly: this.shouldSaveOnly(), content })
    }
    if (Array.isArray(content)) {
      return content.map((c) => c.text).join('\n')
    }

    return this.formatOutput({
      content: JSON.stringify(content, null, 2),
      label: `Tool Use Result: UNKNOWN CONTENT TYPE Line ${resultItem.lineNumber}\n`,
    })
  }

  private formatOutput(options: {
    saveOnly?: boolean
    content: string
    fileContent?: string
    filePath?: string
    codeFence?: boolean
    label?: string
  }): string {
    const output = new OutputFormatter(this.shouldSaveOnly())
    return output.format(options)
  }

  private shouldSaveOnly(): boolean {
    return ['read', 'ls', 'write'].includes(this.toolName.toLowerCase())
  }

  private convertDiff(structuredPatch: StructuredPatch[]): string {
    const diffLines: string[] = []

    for (const patch of structuredPatch) {
      const hunkHeader = `@@ -${patch.oldStart},${patch.oldLines} +${patch.newStart},${patch.newLines} @@`
      diffLines.push(hunkHeader)
      diffLines.push(...patch.lines)
    }

    return diffLines.join('\n')
  }

  private convertToGitDiff(
    filePath: string,
    structuredPatch: StructuredPatch[],
  ): string {
    const diffLines: string[] = [
      `diff --git a${filePath} b${filePath}`,
      `index 1234567..abcdefg 100644`,
      `--- a${filePath}`,
      `+++ b${filePath}`,
    ]

    diffLines.push(this.convertDiff(structuredPatch))
    return diffLines.join('\n')
  }
}
