import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { JsonlToMarkdownConverter } from './JsonlToMarkdownConverter.ts'

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

  const jsonlFiles = readdirSync(jsonlFolderPath).filter((file) =>
    file.endsWith('.jsonl'),
  )
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
      console.log(`✅ Created ${mdFileName}`)
    } else {
      console.log(`⚠️ Skipped ${file} (no valid entries found)`)
    }
  })

  console.log('Done!')
}
