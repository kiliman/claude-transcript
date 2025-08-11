
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