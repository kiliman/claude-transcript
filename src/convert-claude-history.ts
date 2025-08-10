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
} from './types.ts' // Adjust the import path as needed
import { EntrySchema } from './types.ts' // Import schemas for validation

const ItemTree = new Map<string, Item>()
const EntryList: string[] = []
const ToolUseTree = new Map<string, Entry[]>()
let isDebug = false

main()

function main() {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error(
      'Usage: node convert-claude-history.js <path-to-jsonl-folder> [--debug]',
    )
    process.exit(1)
  }

  if (args.includes('--debug')) {
    isDebug = true
    console.log('Debug mode enabled')
  }
  const jsonlFolderPath = args[0]

  if (!existsSync(jsonlFolderPath)) {
    console.error(`Error: Directory not found: ${jsonlFolderPath}`)
    process.exit(1)
  }

  // Read all JSONL files in the folder
  const files = readdirSync(jsonlFolderPath)
  const jsonlFiles = files.filter((file) => file.endsWith('.jsonl'))

  if (jsonlFiles.length === 0) {
    console.log('No JSONL files found in the specified directory.')
    return
  }

  console.log(`Found ${jsonlFiles.length} JSONL file(s) to process...`)

  mkdirSync('transcripts/contents', { recursive: true }) // Ensure contents directory exists
  jsonlFiles.forEach((file) => {
    const jsonlPath = join(jsonlFolderPath, file)
    const markdownContent = convertJsonlToMarkdown(jsonlPath)

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

function convertJsonlToMarkdown(jsonlPath: string): string | null {
  console.log(`Processing file: ${jsonlPath}`)
  ItemTree.clear()
  ToolUseTree.clear() // Clear the tool use tree
  EntryList.length = 0 // Clear the entry list

  const content = readFileSync(jsonlPath, 'utf-8')
  const lines = content.trim().split('\n')

  lines.forEach((line, index) => {
    if (!line.trim()) return
    const lineNumber = index + 1 // 1-based line number
    const entry: Entry = JSON.parse(line)
    if (!entry.uuid) {
      // don't process entries without a UUID
      console.warn(
        `Skipping entry on line ${lineNumber} without UUID:`,
        JSON.stringify(entry, null, 2),
      )
      return
    }
    // validate entry structure with zod schema
    const validation = EntrySchema.safeParse(entry)
    if (!validation.success) {
      console.error(
        `Invalid entry format on line ${lineNumber}:`,
        JSON.stringify(entry, null, 2),
      )
      console.error(validation.error)
      process.exit(1)
    }
    const state: StateType = 'pending' // Default state for new entries
    // if (entry.isMeta === true) {
    //   state = 'skipped' // Skip meta entries
    // }
    // create a new Item object for each entry
    const item: Item = {
      uuid: entry.uuid,
      parentUuid: entry.parentUuid || null,
      lineNumber,
      state,
      entry,
    }
    ItemTree.set(item.uuid, item)
    EntryList.push(entry.uuid)
    // walk up the parent chain to and mark any skipped entries as skipped
    let currentParentUuid = item.parentUuid
    while (currentParentUuid) {
      const parentItem = ItemTree.get(currentParentUuid)
      if (parentItem) {
        if (parentItem.state === 'skipped') {
          item.state = 'skipped'
          return // Stop if we hit a skipped parent
        }
      }
      currentParentUuid = parentItem ? parentItem.parentUuid : null
    }

    const toolUseId = isToolUse(entry)
    if (toolUseId) {
      ToolUseTree.set(toolUseId, [])
    }
    const toolUseResultId = isToolResult(entry)
    if (toolUseResultId) {
      const existingResults = ToolUseTree.get(toolUseResultId)
      if (existingResults) {
        existingResults.push(entry)
        if (existingResults.length > 1) {
          console.warn(
            'Found multiple tool results for tool_use_id:',
            toolUseResultId,
          )
          process.exit(0)
        }
      } else {
        ToolUseTree.set(toolUseResultId, [entry])
      }
    }
  })

  // Second pass: Process entries with access to tool results
  const markdownSections: string[] = []
  let hasValidEntries = false
  console.log(`Processing ${EntryList.length} entries...`)
  EntryList.forEach((uuid) => {
    const item = ItemTree.get(uuid)
    const entry = item?.entry
    if (!entry) {
      console.warn(`Entry with UUID ${uuid} not found in ItemTree`)
      return
    }
    if (item.state === 'skipped' || item.state === 'processed') {
      console.warn(
        `Line #${item.lineNumber} is already ${item.state}, skipping`,
      )
      return
    }
    if (item.state === 'pending') {
      item.state = 'processing' // Mark as processing
    }

    const markdown = processItem(item)
    if (markdown) {
      if (isDebug) {
        markdownSections.push(`## Line ${item.lineNumber}`)
      }
      markdownSections.push(markdown)
      hasValidEntries = true
    }
  })

  if (!hasValidEntries) {
    return null
  }

  // Join sections with blank lines between them
  return markdownSections.join('\n\n')
}

function processItem(item: Item): string | null {
  if (item.state === 'skipped' || item.state === 'processed') {
    console.warn(
      `Skipping item with UUID ${item.uuid} on line #${item.lineNumber} (state: ${item.state})`,
    )
    return null // Skip already processed or skipped items
  }

  const { entry, lineNumber } = item
  const output: (string | null)[] = []

  if (!entry.message || !entry.message.content) {
    console.warn(
      `Entry with UUID ${entry.uuid} has no message or content on line #${lineNumber}`,
    )
    return null
  }

  console.log(`#${lineNumber} ${entry.type}`)

  if (typeof entry.message.content === 'string') {
    // Handle string content (common in older entries)
    output.push(outputTextContent(item, entry.message.content))

    // Parse for command elements
  } else if (Array.isArray(entry.message.content)) {
    // Handle array format (common in newer entries)
    for (const contentItem of entry.message.content) {
      if (contentItem.type === 'text' && contentItem.text) {
        const text = contentItem.text
        output.push(outputTextContent(item, text))
      } else if (contentItem.type === 'tool_use') {
        output.push(outputToolUse(item, contentItem))
      }
    }
  } else {
    // Unknown format
    output.push(`## Unknown user line #${lineNumber}`)
    output.push('```json')
    output.push(JSON.stringify(entry, null, 2))
    output.push('```')
  }

  return output.length > 0 ? output.filter(Boolean).join('\n') : null
}

function outputToolUse(item: Item, contentItem: Content): string {
  const output: string[] = []
  // Format tool use with emoji and name
  const toolName = contentItem.name || 'Unknown Tool'
  const pattern = contentItem.input?.pattern
    ? `\`"${contentItem.input.pattern.replace(/\\/g, '\\')}"\``
    : ''
  const description =
    contentItem.input?.description ||
    pattern ||
    contentItem.input?.path ||
    contentItem.input?.file_path ||
    ''
  output.push(`${getToolEmoji(toolName)} **${toolName} ${description}**`)

  if (contentItem.input?.command) {
    output.push(`\`\`\`shell\n${contentItem.input?.command}\n\`\`\``)
  }
  item.state = 'processing'
  // Look for tool result in child entries
  const toolUseId = contentItem.id || ''
  const existingResults = ToolUseTree.get(toolUseId)
  if (existingResults) {
    for (const result of existingResults) {
      if (!result.message || !result.message.content) {
        console.warn(
          `Tool result with UUID ${result.uuid} has no message or content`,
        )
        continue
      }
      const resultItem = ItemTree.get(result.uuid || '')
      if (!resultItem) {
        console.warn(
          `Tool result with UUID ${result.uuid} not found in ItemTree`,
        )
        continue
      }
      if (result.toolUseResult) {
        output.push(
          outputToolUseResult(
            toolName,
            resultItem,
            result.toolUseResult as ToolUseResult,
          ),
        )
      } else {
        output.push(
          `## Tool result for tool_use_id ${toolUseId} on line #${item.lineNumber} at line #${resultItem?.lineNumber} `,
        )
        output.push('```json')
        output.push(JSON.stringify(result, null, 2))
        output.push('```')
      }
    }
  }
  return output.join('\n')
}

function outputToolUseResult(
  toolName: string,
  item: Item,
  toolUseResult: ToolUseResult,
): string {
  const output: string[] = []
  const saveOnly = ['read', 'ls', 'write'].includes(toolName.toLowerCase())
  // Check if toolUseResult has a file object
  if (typeof toolUseResult === 'object') {
    if (toolUseResult.file) {
      output.push(
        handleOutput({
          saveOnly,
          content: toolUseResult.file.content,
          filePath: toolUseResult.filePath,
        }),
      )
    } else if (
      toolUseResult.filePath &&
      typeof toolUseResult.content === 'string'
    ) {
      output.push(
        handleOutput({
          saveOnly,
          content: toolUseResult.content,
          filePath: toolUseResult.filePath,
        }),
      )
    } else if (toolUseResult.filenames) {
      // Handle multiple filenames
      const content = toolUseResult.filenames.join('\n')
      output.push(handleOutput({ saveOnly, content }))
    } else if (
      toolName.toLowerCase() === 'todowrite' &&
      toolUseResult.newTodos
    ) {
      //output.push(`Tool Use Result: TODOWRITE Line ${item.lineNumber}`)
      const content = toolUseResult.newTodos
        .map((todo) => {
          return `- [${todo.status === 'completed' ? 'x' : ' '}]${todo.status === 'in_progress' ? ' ⏳' : ''} ${todo.content} ${todo.priority === 'high' ? '🔺' : todo.priority === 'medium' ? '' : '🔻'}`
        })
        .join('\n')
      output.push(content)
    } else if (
      toolUseResult.stdout !== undefined &&
      toolUseResult.isImage === false
    ) {
      if (toolUseResult.stdout.length === 0) {
        return '' // Skip empty stdout entries
      }
      const content = toolUseResult.stdout
      output.push(handleOutput({ saveOnly, content }))
    } else if (toolUseResult.structuredPatch && toolUseResult.filePath) {
      const content = convertDiff(toolUseResult.structuredPatch)
      const fileContent = convertToGitDiff(
        toolUseResult.filePath,
        toolUseResult.structuredPatch,
      )
      output.push(
        handleOutput({
          saveOnly,
          content,
          fileContent,
          filePath: `${toolUseResult.filePath}.patch`,
        }),
      )
    } else if (toolUseResult.content) {
      // Handle content as string or array
      output.push('')
      if (typeof toolUseResult.content === 'string') {
        output.push(handleOutput({ saveOnly, content: toolUseResult.content }))
      } else if (Array.isArray(toolUseResult.content)) {
        const content = toolUseResult.content.map((c) => c.text).join('\n')
        output.push(content)
      } else {
        output.push(
          `Tool Use Result: UNKNOWN CONTENT TYPE Line ${item.lineNumber}\n`,
        )
        const content = JSON.stringify(toolUseResult.content, null, 2)
        output.push(handleOutput({ saveOnly, content }))
      }
    } else {
      output.push(`Tool Use Result: UNKNOWN Line ${item.lineNumber}`)
      const content = JSON.stringify(toolUseResult, null, 2)
      output.push(handleOutput({ saveOnly, content }))
    }
  } else {
    //output.push(`Tool Use Result: STRING Line ${item.lineNumber}`)
    output.push(handleOutput({ saveOnly, content: toolUseResult }))
  }
  item.state = 'processed' // Mark as processed
  return output.join('\n')
}

function escapeCodeFences(content: string): string {
  // Replace ``` with \`\`\` to escape code fences in markdown
  return content.replace(/```/g, '\\`\\`\\`')
}

function handleOutput({
  saveOnly,
  content,
  fileContent,
  filePath,
}: {
  saveOnly: boolean
  content: string
  fileContent?: string
  filePath?: string
}): string {
  if (content.length === 0) {
    return ''
  }
  const output: string[] = []
  // Determine language from file extension
  const ext = filePath?.split('.').pop()?.toLowerCase() || ''
  const language = getLanguageFromExtension(ext)

  // Handle potentially large file content
  const {
    content: processedContent,
    savedPath,
    remainingLines,
  } = handleLargeContent({ saveOnly, content, fileContent, filePath })

  if (saveOnly) {
    output.push(`([view file](${savedPath}))`)
  } else {
    output.push(`\`\`\`${language}`)
    output.push(processedContent)
    output.push('```')

    // Add truncation notice outside code fence
    if (savedPath) {
      output.push(
        `${remainingLines ? `... +${remainingLines} lines ` : ''}([view file](${savedPath}))`,
      )
    }
  }
  return output.join('\n')
}

function handleLargeContent({
  saveOnly,
  content,
  fileContent,
  filePath,
}: {
  saveOnly: boolean
  content: string
  fileContent?: string
  filePath?: string
}): { content: string; savedPath?: string; remainingLines?: number } {
  if (!fileContent) {
    fileContent = content // Save full content if no separate fileContent provided
  }
  let truncatedLineCount = 0
  const lines = content
    .split('\n')
    .map((line) => filterAnsi(line)) // Escape backticks for markdown
    .map((line) => {
      const t = truncateLine(line, 120)
      if (t !== line) truncatedLineCount++
      return t
    })
  const lineCount = lines.length

  // If 12 lines or fewer, return as is (but escaped for markdown)
  // Need to save if there were truncated lines
  if (!saveOnly && lineCount <= 12 && !truncatedLineCount) {
    return { content: escapeCodeFences(lines.join('\n')) }
  }

  // Truncate to 8 lines
  const truncatedLines = lines.slice(0, 8)
  const remainingLines = lineCount - 8

  // Generate hash for filename
  const hash = createHash('md5')
    .update(fileContent)
    .digest('hex')
    .substring(0, 8)

  // Extract extension and basename from filePath
  let extension = ''
  let baseFileName = 'results' // Default basename when no filePath provided

  if (filePath) {
    const ext = filePath.split('.').pop()
    if (ext && ext !== filePath) {
      extension = `.${ext}`
    }
    baseFileName = basename(filePath, extension).replace(/[^a-zA-Z0-9-_]/g, '_')
  }

  // Create filename with basename-hash.extension format
  const filename = `${baseFileName}-${hash}${extension}`
  const savedPath = join('transcripts/contents', filename)

  // Save full content to file (raw, unescaped)
  writeFileSync(savedPath, fileContent, 'utf-8')

  return {
    content: escapeCodeFences(truncatedLines.join('\n')),
    savedPath: join('contents', filename), // relative path
    remainingLines: Math.max(0, remainingLines),
  }
}

function getLanguageFromExtension(ext: string): string {
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

function parseCommandContent(text: string): string[] | null {
  const output: string[] = []

  // Extract command name
  const commandNameMatch = text.match(/<command-name>([^<]*)<\/command-name>/)
  const commandName = commandNameMatch ? commandNameMatch[1].trim() : ''

  // Extract command args
  const commandArgsMatch = text.match(/<command-args>([^<]*)<\/command-args>/)
  const commandArgs = commandArgsMatch ? commandArgsMatch[1].trim() : ''

  // Extract command message
  const commandMessageMatch = text.match(
    /<command-message>([^<]*)<\/command-message>/,
  )
  const commandMessage = commandMessageMatch
    ? commandMessageMatch[1].trim()
    : ''

  // Extract stdout
  const stdoutMatch = text.match(
    /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/,
  )
  const stdout = stdoutMatch ? stdoutMatch[1].trim() : ''

  // If this is just an empty stdout entry, skip it entirely
  if (!commandName && stdoutMatch && !stdout) {
    return null
  }

  // Format command if we have it
  if (commandName) {
    const fullCommand = commandArgs
      ? `${commandName} ${commandArgs}`
      : commandName
    output.push(`> \`${fullCommand}\`\\`)
  }
  if (commandMessage) {
    output.push(`> ${commandMessage}`)
  }

  // Add stdout in bash code fence if present and not empty
  if (stdout && stdout.length > 0) {
    output.push('> ```bash')
    const stdoutLines = stdout.split('\n')
    output.push(...stdoutLines.map((line) => `> ${line}`))
    output.push('> ```')
  }

  // If we didn't find any command elements, output as blockquote
  if (output.length === 0) {
    const lines = text.split('\n')
    output.push(...lines.map((line) => `> ${line}`))
  }

  return output
}

function isToolUse(entry: Entry) {
  // Checks if entry.message.content has type "tool_use" and returns its id if present
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
function isToolResult(entry: Entry): string | null {
  // Checks if entry.message.content has type "tool_result" and returns its tool_use_id if present
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

function outputTextContent(item: Item, text: string) {
  const { entry, lineNumber } = item
  const output: string[] = []
  if (
    text.includes('<command-name>') ||
    text.includes('<local-command-stdout>')
  ) {
    const parsed = parseCommandContent(text)
    if (parsed === null) return null // Skip empty stdout entries
    output.push(...parsed)
  } else {
    if (entry.type === 'user') {
      // Convert to blockquote
      const lines = text.split('\n')
      output.push(...lines.map((line) => `> ${line}`))
    } else if (entry.type === 'assistant') {
      // For assistant entries, escape code fences
      output.push(escapeCodeFences(text))
    } else {
      // Unknown type, just output as is
      output.push(`## Unknown entry type ${entry.type} on line #${lineNumber}`)
      output.push('```json')
      output.push(JSON.stringify(entry, null, 2))
      output.push('```')
    }
  }
  return output.join('\n')
}

function convertDiff(structuredPatch: StructuredPatch[]): string {
  // Create Git-style diff header
  const diffLines: string[] = []

  // Process each patch chunk
  for (const patch of structuredPatch) {
    // Add hunk header
    const hunkHeader = `@@ -${patch.oldStart},${patch.oldLines} +${patch.newStart},${patch.newLines} @@`
    diffLines.push(hunkHeader)

    // Add the patch lines
    diffLines.push(...patch.lines)
  }

  return diffLines.join('\n')
}

function convertToGitDiff(
  filePath: string,
  structuredPatch: StructuredPatch[],
): string {
  // Create Git-style diff header
  const diffLines: string[] = [
    `diff --git a${filePath} b${filePath}`,
    `index 1234567..abcdefg 100644`,
    `--- a${filePath}`,
    `+++ b${filePath}`,
  ]

  diffLines.push(convertDiff(structuredPatch))

  return diffLines.join('\n')
}

function getToolEmoji(toolName: string): string {
  const toolToEmojiMap: { [key: string]: string } = {
    ls: '📂',
    read: '📖',
    write: '✍️',
    edit: '✏️',
    multiedit: '✏️',
    glob: '🔍',
    todowrite: '✅',
    bash: '🐚',
  }

  return toolToEmojiMap[toolName.toLowerCase()] || '🛠️'
}
function filterAnsi(line: string): string {
  // Remove ANSI escape codes (color codes, etc.)
  // Regex matches most common ANSI escape sequences
  return line.replace(
    // eslint-disable-next-line no-control-regex
    // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
    /\x1b\[[0-9;]*m/g,
    '',
  )
}

// Helper to truncate a single line if it's too long
function truncateLine(line: string, maxLength: number): string {
  if (line.length > maxLength) {
    return line.slice(0, maxLength) + '...(truncated)'
  }
  return line
}
