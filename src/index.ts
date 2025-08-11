#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { JsonlToMarkdownConverter } from './JsonlToMarkdownConverter.ts'
import { assert } from './utils.ts'

// Get package.json version
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'))
const version = packageJson.version

const program = new Command()

program
  .name('claude-transcript')
  .description('Convert Claude JSONL files to markdown transcripts')
  .version(version)
  .argument('[path]', 'Path to JSONL folder (defaults to ~/.claude/projects/<sanitized-cwd>)')
  .option('--debug', 'Enable debug mode')
  .option('-o, --output <directory>', 'Output directory', '.claude-transcripts')
  .parse()

const options = program.opts()
const args = program.args

main()

function main() {
  const isDebug = options['debug'] || false
  const outputDir = options['output']

  if (isDebug) {
    console.log('Debug mode enabled')
    console.log(`Output directory: ${outputDir}`)
  }

  // Determine JSONL folder path
  let jsonlFolderPath: string
  if (args.length > 0) {
    const firstArg = args[0]
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
    if (args.length === 0) {
      console.error('Run with --help for usage information')
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

  // Create output directory
  const contentsDir = join(outputDir, 'contents')
  mkdirSync(contentsDir, { recursive: true })

  jsonlFiles.forEach((file) => {
    const jsonlPath = join(jsonlFolderPath, file)
    const converter = new JsonlToMarkdownConverter({
      isDebug: isDebug,
      outputDir: outputDir,
    })
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
