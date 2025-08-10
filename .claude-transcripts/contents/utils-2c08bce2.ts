import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export function filterAnsi(line: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes
  return line.replace(/\x1b\[[0-9;]*m/g, '')
}

export function truncateLine(line: string, maxLength: number): string {
  return line.length > maxLength
    ? `${line.slice(0, maxLength)}...(truncated)`
    : line
}

export function escapeCodeFences(content: string): string {
  return content.replace(/```/g, '\\`\\`\\`')
}

export function trimBlankLines(lines: string[]): string[] {
  // trim leading and trailing blank lines
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

export function getLanguageFromExtension(filePath: string): string {
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

export function assert<T>(
  value: T,
  message?: string,
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error(message || 'Assertion failed: Value is null or undefined')
  }
}

export function createImageFile(
  base64Data: string,
  mediaType: string,
  uuid?: string,
): string {
  const hash = createHash('md5')
    .update(base64Data)
    .digest('hex')
    .substring(0, 8)
  const extension = mediaType.split('/')[1] || 'png'
  const filename = `image-${uuid || hash}.${extension}`
  const savedPath = join('transcripts/contents', filename)

  // Write the image file
  writeFileSync(savedPath, Buffer.from(base64Data, 'base64'))

  return filename
}