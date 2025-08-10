import { readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { JsonlToMarkdownConverter } from './JsonlToMarkdownConverter.ts'

main()

function main() {
  const args = process.argv.slice(2)
  const isDebug = args.includes('--debug')
  