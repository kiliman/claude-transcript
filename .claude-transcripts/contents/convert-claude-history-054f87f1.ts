import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs'
import { join, basename } from 'node:path'
import { createHash } from 'node:crypto'
import type {
  Entry,
  StateType,
  Item,
  ToolUseResult,
  Content,
  StructuredPatch,
} from './types.ts'
import { EntrySchema } from './types.ts'

// Main entry point
main()

function main() {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error(
      'Usage: node convert-claude-history.js <path-to-jsonl-folder> [--debug]',
    )
    process.exit(1)
  }

  const isDebug = args.includes('--debug')
  if (isDebug) {
    console.log('Debug mode enabled')
  }
  
  const jsonlFolderPath = args[0]
  if (!existsSync(jsonlFolderPath)) {
    console.error(`Error: Directory not found: ${jsonlFolderPath}`)
    process.exit(1)
  }

  const jsonlFiles = readdirSync(jsonlFolderPath).filter((file) => file.endsWith('.jsonl'))
  if (jsonlFiles.length === 0) {
    console.log('No JSONL files found in the specified directory.')
    return
  }

  console.log(`Found ${jsonlFiles.length} JSONL file(s) to process...`)
  mkdirSync('transcripts/contents', { recursive: true })

  jsonlFiles.forEach((file) => {
    const jsonlPath = join(jsonlFolderPath, file)
    const converter = new JsonlToMarkdownConverter(isDebug)
    const markdownContent = converter.convert(jsonlPath)

    if (markdownContent !== null) {
      const mdFileName = `${basename(file, '.jsonl')}.md`
      writeFileSync(join('transcripts', mdFileName), markdownContent)
      console.log(`✓ Created ${mdFileName}`)
    } else {
      console.log(`⚠ Skipped ${file} (no valid entries found)`)
    }
  })

  console.log('Done!')
}

// Main converter class that encapsulates all state and logic
class JsonlToMarkdownConverter {
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

  private parseJsonlFile(jsonlPath: string): Array<{ entry: Entry; lineNumber: number }> {
    const content = readFileSync(jsonlPath, 'utf-8')
    const lines = content.trim().split('\n')
    const entries: Array<{ entry: Entry; lineNumber: number }> = []

    lines.forEach((line, index) => {
      if (!line.trim()) return
      
      const lineNumber = index + 1
      try {
        const entry: Entry = JSON.parse(line)
        
        if (!entry.uuid) {
          console.warn(`Skipping entry on line ${lineNumber} without UUID:`, JSON.stringify(entry, null, 2))
          return
        }

        const validation = EntrySchema.safeParse(entry)
        if (!validation.success) {
          console.error(`Invalid entry format on line ${lineNumber}:`, JSON.stringify(entry, null, 2))
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
      const state: StateType = entry.isMeta === true ? 'skipped' : 'pending'
      
      const item: Item = {
        uuid: entry.uuid!,
        parentUuid: entry.parentUuid || null,
        lineNumber,
        state,
        entry,
      }
      
      this.itemTree.set(item.uuid, item)
      this.entryList.push(entry.uuid!)

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
          console.warn('Found multiple tool results for tool_use_id:', toolUseResultId)
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
        console.warn(`Line #${item.lineNumber} is already ${item.state}, skipping`)
        return
      }

      item.state = 'processing'
      const markdown = this.processItem(item)
      
      if (markdown) {
        markdownSections.push(markdown)
      }
    })

    return markdownSections
  }

  private processItem(item: Item): string | null {
    if (item.state === 'skipped' || item.state === 'processed') {
      console.warn(`Skipping item with UUID ${item.uuid} on line #${item.lineNumber} (state: ${item.state})`)
      return null
    }

    const { entry, lineNumber } = item
    const output: string[] = []

    if (!entry.message || !entry.message.content) {
      console.warn(`Entry with UUID ${entry.uuid} has no message or content on line #${lineNumber}`)
      return null
    }

    console.log(`#${lineNumber} ${entry.type}`)
    if (this.isDebug) {
      output.push(`## Line ${lineNumber} ${entry.type} (isSidechain: ${entry.isSidechain})`)
    }

    // Handle sidechain user entries as assistant
    const entryType = (entry.type === 'user' && entry.isSidechain) ? 'assistant' : entry.type

    if (typeof entry.message.content === 'string') {
      const text = this.formatTextContent(item, entry.message.content, entryType)
      if (text) output.push(text)
    } else if (Array.isArray(entry.message.content)) {
      entry.message.content.forEach((contentItem, index) => {
        if (index > 0) output.push('')
        
        const formattedContent = this.formatContentItem(item, contentItem, entryType)
        if (formattedContent) output.push(formattedContent)
      })
    } else {
      output.push(`## Unknown user line #${lineNumber}`)
      output.push('```json')
      output.push(JSON.stringify(entry, null, 2))
      output.push('```')
    }

    return output.length > 0 ? output.join('\n') : null
  }

  private formatContentItem(item: Item, contentItem: Content, entryType: string): string | null {
    switch (contentItem.type) {
      case 'text':
        return contentItem.text ? this.formatTextContent(item, contentItem.text, entryType) : null
      case 'tool_use':
        return this.formatToolUse(item, contentItem)
      case 'image':
        return this.formatImage(item, contentItem)
      default:
        return null
    }
  }

  private formatTextContent(item: Item, text: string, entryType: string): string | null {
    if (text === '(no content)') {
      console.warn(`Skipping empty content on line #${item.lineNumber}`)
      return null
    }

    const output: string[] = []

    if (this.hasCommandElements(text)) {
      const parsed = this.parseCommandContent(text)
      if (parsed) output.push(...parsed)
    } else if (entryType === 'user') {
      output.push(...this.formatUserMessage(text))
    } else if (entryType === 'assistant') {
      output.push(text)
    } else {
      output.push(`## Unknown entry type ${entryType} on line #${item.lineNumber}`)
      output.push('```json')
      output.push(JSON.stringify(item.entry, null, 2))
      output.push('```')
    }

    return output.length > 0 ? output.join('\n') : null
  }

  private formatUserMessage(text: string): string[] {
    const output: string[] = []
    
    if (text.startsWith('[Request interrupted')) {
      output.push(`> [!WARNING]`)
    } else if (text.startsWith("Error: The user doesn't want to proceed")) {
      output.push(`> [!CAUTION]`)
    } else {
      output.push(`> [!IMPORTANT]`)
    }
    
    const lines = text.split('\n')
    output.push(...lines.map(line => `> ${line}`))
    
    return output
  }

  private formatToolUse(item: Item, contentItem: Content): string {
    const output: string[] = []
    const toolName = contentItem.name || 'Unknown Tool'
    const description = this.getToolDescription(contentItem)
    
    output.push(`${this.getToolEmoji(toolName)} **${toolName}${description ? `: ${description}` : ''}**`)

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
      if (index > 0) output.push('')
      
      const resultItem = this.itemTree.get(result.uuid || '')
      if (!resultItem) {
        console.warn(`Tool result with UUID ${result.uuid} not found in ItemTree`)
        return
      }

      if (result.toolUseResult) {
        const formattedResult = this.formatToolResult(toolName, resultItem, result.toolUseResult as ToolUseResult)
        if (formattedResult) output.push(formattedResult)
      } else {
        output.push(`## Tool result for tool_use_id ${toolUseId} on line #${item.lineNumber} at line #${resultItem.lineNumber}`)
        output.push('```json')
        output.push(JSON.stringify(result, null, 2))
        output.push('```')
      }
    })

    return output.join('\n')
  }

  private formatToolResult(toolName: string, resultItem: Item, toolUseResult: ToolUseResult): string {
    const output: string[] = []
    const formatter = new ToolResultFormatter(toolName, this.isDebug)
    
    if (this.isDebug) {
      output.push(`### Tool Use Result for ${toolName} on line #${resultItem.lineNumber} (isSidechain: ${resultItem.entry.isSidechain})`)
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
      const hash = createHash('md5')
        .update(contentItem.source.data)
        .digest('hex')
        .substring(0, 8)
      const extension = contentItem.source.media_type.split('/')[1] || 'png'
      const filename = `image-${item.uuid || hash}.${extension}`
      const savedPath = join('transcripts/contents', filename)

      writeFileSync(savedPath, Buffer.from(contentItem.source.data, 'base64'))

      return `![Image](contents/${filename})`
    }

    return [
      `## Unhandled image content on line #${item.lineNumber}`,
      '```json',
      JSON.stringify(contentItem, null, 2),
      '```',
    ].join('\n')
  }

  private parseCommandContent(text: string): string[] | null {
    const parser = new CommandParser(text)
    return parser.parse()
  }

  private hasCommandElements(text: string): boolean {
    return text.includes('<command-name>') || 
           text.includes('<local-command-stdout>') || 
           text.includes('<user-memory-input>')
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

// Handles parsing of command-style content
class CommandParser {
  constructor(private text: string) {}

  parse(): string[] | null {
    const output: string[] = []

    // Check for memory input first
    const memoryInput = this.extractTag('user-memory-input')
    if (memoryInput) {
      output.push(`> [!NOTE]`)
      output.push(`> 🧠 ${memoryInput}`)
      return output
    }

    const commandName = this.extractTag('command-name')
    const commandArgs = this.extractTag('command-args')
    const commandMessage = this.extractTag('command-message')
    const stdout = this.extractTag('local-command-stdout', true)

    // Skip empty stdout entries
    if (!commandName && stdout !== null && !stdout) {
      return null
    }
    if (stdout === '(no content)') {
      return null
    }

    if (!stdout) {
      output.push(`> [!IMPORTANT]`)
    }

    if (commandName) {
      const fullCommand = commandArgs ? `${commandName} ${commandArgs}` : commandName
      output.push(`> \`${fullCommand}\`\\`)
    }
    if (commandMessage) {
      output.push(`> ${commandMessage}`)
    }

    if (stdout && stdout.length > 0) {
      output.push('```bash')
      output.push(...stdout.split('\n').map(line => filterAnsi(line)))
      output.push('```')
    }

    // Fallback if no command elements found
    if (output.length === 0) {
      const lines = this.text.split('\n')
      output.push(...lines.map(line => `> ${line}`))
    }

    return output
  }

  private extractTag(tagName: string, multiline: boolean = false): string | null {
    const pattern = multiline 
      ? new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`)
      : new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`)
    
    const match = this.text.match(pattern)
    return match ? match[1].trim() : null
  }
}

// Handles formatting of tool results
class ToolResultFormatter {
  constructor(
    private toolName: string,
    private isDebug: boolean
  ) {}

  format(toolUseResult: ToolUseResult, resultItem: Item): string | null {
    if (typeof toolUseResult !== 'object') {
      return this.formatOutput({ content: toolUseResult })
    }

    // Handle file-based results
    if (toolUseResult.file) {
      return this.formatFileResult(toolUseResult.file, toolUseResult.filePath)
    }
    if (toolUseResult.filePath && typeof toolUseResult.content === 'string') {
      return this.formatFileResult({ 
        content: toolUseResult.content,
        filePath: toolUseResult.filePath,
        numLines: 0,
        startLine: 0,
        totalLines: 0
      }, toolUseResult.filePath)
    }

    // Handle specific tool types
    if (toolUseResult.filenames) {
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
        codeFence: false 
      })
    }
    if (toolUseResult.structuredPatch && toolUseResult.filePath) {
      return this.formatPatch(toolUseResult.filePath, toolUseResult.structuredPatch)
    }
    if (toolUseResult.content) {
      return this.formatContent(toolUseResult.content, resultItem)
    }

    // Fallback
    return this.formatOutput({ 
      content: JSON.stringify(toolUseResult, null, 2),
      label: `Tool Use Result: UNKNOWN Line ${resultItem.lineNumber}`
    })
  }

  private formatFileResult(file: any, filePath?: string): string {
    return this.formatOutput({
      saveOnly: this.shouldSaveOnly(),
      content: file.content,
      filePath: filePath || file.filePath
    })
  }

  private formatTodos(todos: any[]): string {
    return todos.map(todo => {
      const checked = todo.status === 'completed' ? 'x' : ' '
      const inProgress = todo.status === 'in_progress' ? ' ⏳' : ''
      const priority = todo.priority === 'high' ? '⚡️' : ''
      return `- [${checked}]${inProgress} ${todo.content} ${priority}`
    }).join('\n')
  }

  private formatPatch(filePath: string, structuredPatch: StructuredPatch[]): string {
    const content = this.convertDiff(structuredPatch)
    const fileContent = this.convertToGitDiff(filePath, structuredPatch)
    
    return this.formatOutput({
      saveOnly: this.shouldSaveOnly(),
      content,
      fileContent,
      filePath: `${filePath}.patch`
    })
  }

  private formatContent(content: any, resultItem: Item): string {
    if (typeof content === 'string') {
      return this.formatOutput({ saveOnly: this.shouldSaveOnly(), content })
    }
    if (Array.isArray(content)) {
      return content.map(c => c.text).join('\n')
    }
    
    return this.formatOutput({ 
      content: JSON.stringify(content, null, 2),
      label: `Tool Use Result: UNKNOWN CONTENT TYPE Line ${resultItem.lineNumber}\n`
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

  private convertToGitDiff(filePath: string, structuredPatch: StructuredPatch[]): string {
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

// Handles output formatting with truncation and file saving
class OutputFormatter {
  constructor(private defaultSaveOnly: boolean) {}

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
      label
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
    const effectiveFilePath = content.startsWith('diff --git') ? filePath || 'diff.patch' : filePath

    // Process content
    const processed = this.processContent({
      saveOnly,
      content,
      fileContent,
      filePath: effectiveFilePath,
      codeFence
    })

    if (saveOnly) {
      output.push(`([view file](${processed.savedPath}))`)
    } else {
      if (codeFence) {
        const language = effectiveFilePath ? getLanguageFromExtension(effectiveFilePath) : ''
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
    const { saveOnly, content, fileContent = content, filePath, codeFence } = options
    
    let truncatedLineCount = 0
    const lines = content
      .split('\n')
      .map(line => filterAnsi(line))
      .map(line => {
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
      remainingLines
    }
  }

  private saveToFile(content: string, filePath?: string): string {
    const hash = createHash('md5')
      .update(content)
      .digest('hex')
      .substring(0, 8)

    let extension = ''
    let baseFileName = 'results'

    if (filePath) {
      const ext = filePath.split('.').pop()
      if (ext && ext !== filePath) {
        extension = `.${ext}`
      }
      baseFileName = basename(filePath, extension).replace(/[^a-zA-Z0-9-_]/g, '_')
    }

    const filename = `${baseFileName}-${hash}${extension}`
    const savedPath = join('transcripts/contents', filename)
    
    writeFileSync(savedPath, content, 'utf-8')
    
    return join('contents', filename)
  }
}

// Utility functions
function filterAnsi(line: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
  return line.replace(/\x1b\[[0-9;]*m/g, '')
}

function truncateLine(line: string, maxLength: number): string {
  return line.length > maxLength ? line.slice(0, maxLength) + '...(truncated)' : line
}

function escapeCodeFences(content: string): string {
  return content.replace(/```/g, '\\`\\`\\`')
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0
  while (start < lines.length && lines[start].trim() === '') {
    start++
  }
  
  let end = lines.length - 1
  while (end >= start && lines[end].trim() === '') {
    end--
  }
  
  return lines.slice(start, end + 1)
}

function getLanguageFromExtension(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  
  const languageMap: { [key: string]: string } = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    mjs: 'javascript',
    cjs: 'javascript',

    // Web
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    // Data formats
    json: 'json',
    jsonl: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    xml: 'xml',

    // Programming languages
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    r: 'r',
    lua: 'lua',
    dart: 'dart',
    elm: 'elm',
    clj: 'clojure',
    ex: 'elixir',
    exs: 'elixir',

    // Shell/Scripts
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    ps1: 'powershell',
    bat: 'batch',
    cmd: 'batch',

    // Config files
    ini: 'ini',
    cfg: 'ini',
    conf: 'conf',
    properties: 'properties',
    env: 'bash',

    // Documentation
    md: 'markdown',
    markdown: 'markdown',
    rst: 'rst',
    tex: 'latex',

    // Database
    sql: 'sql',

    // Other
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    mk: 'makefile',
    diff: 'diff',
    patch: 'diff',
  }

  return languageMap[ext] || ''
}