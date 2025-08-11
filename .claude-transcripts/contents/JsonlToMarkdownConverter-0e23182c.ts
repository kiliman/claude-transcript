import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { CommandParser } from './CommandParser.ts'
import { OutputFormatter } from './OutputFormatter.ts'
import type { Entry, Item, StateType } from './types.ts'
import { EntrySchema } from './types.ts'
import { assert } from './utils.ts'

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
