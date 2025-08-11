import type { OutputFormatter } from './OutputFormatter.ts'
import type {
  Content,
  File,
  Item,
  StructuredPatch,
  Todo,
  ToolUseResult,
} from './types.ts'

export class ToolResultFormatter {
  private toolName: string
  private outputFormatter: OutputFormatter

  constructor(toolName: string, outputFormatter: OutputFormatter) {
    this.toolName = toolName
    this.outputFormatter = outputFormatter
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