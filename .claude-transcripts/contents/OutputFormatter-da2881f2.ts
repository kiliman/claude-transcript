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
