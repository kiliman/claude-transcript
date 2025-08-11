#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { JsonlToMarkdownConverter } from './JsonlToMarkdownConverter.ts'
import { assert } from './utils.ts'

main()

function main() {
  const args = process.argv.slice(2)
  const isDebug = args.includes('--debug')

  // Remove --debug from args for path processing
  const pathArgs = args.filter((arg) => arg !== '--debug')

  if (isDebug) {
    console.log('Debug mode enabled')
  }

  // Determine JSONL folder path
  let jsonlFolderPath: string
  if (pathArgs.length > 0) {
    const firstArg = pathArgs[0]
    assert(firstArg, 'Path argument must be defined')
    jsonlFolderPath = firstArg
  } else {
    // Auto-detect from ~/.claude/projects/
    const cwd = process.cwd()
    const sanitizedPath = cwd.replace(/[^a-zA-Z0-9]/g, '-')
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || ''
    jsonlFolderPath = join(homeDir, '.claude', 'projects', sanitizedPath)
    console.log(`No path provided. Looking in: ${jsonlFolderPath}`)
  }

  if (!existsSync(jsonlFolderPath)) {
    console.error(`Error: Directory not found: ${jsonlFolderPath}`)
    if (pathArgs.length === 0) {
      console.error('Usage: node index.js [path-to-jsonl-folder] [--debug]')
      console.error(
        'If no path is provided, will look in ~/.claude/projects/<sanitized-cwd>',
      )
    }
    process.exit(1)
  }

  const jsonlFiles = readdirSync(jsonlFolderPath).filter((file) =>
    file.endsWith('.jsonl'),
  )
  if (jsonlFiles.length === 0) {
    console.log('No JSONL files found in the specified directory.')
    return
  }

  console.log(`Found ${jsonlFiles.length} JSONL file(s) to process...`)

  // Create output directory in current working directory
  const outputDir = '.claude-transcripts'
  const contentsDir = join(outputDir, 'contents')
  mkdirSync(contentsDir, { recursive: true })

  jsonlFiles.forEach((file) => {
    const jsonlPath = join(jsonlFolderPath, file)
    const converter = new JsonlToMarkdownConverter(isDebug)
    const result = converter.convert(jsonlPath)

    if (result !== null) {
      const mdFileName = result.filename
      writeFileSync(join(outputDir, mdFileName), result.content)
      console.log(`✅ Created ${mdFileName}`)
    } else {
      console.log(`⚠️ Skipped ${file} (no valid entries found)`)
    }
  })

  console.log('Done!')
}
