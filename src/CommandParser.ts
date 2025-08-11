import { filterAnsi } from './utils.ts'

export class CommandParser {
  private text: string

  constructor(text: string) {
    this.text = text
  }

  hasCommandElements(): boolean {
    return (
      /<command-name>/.test(this.text) ||
      /<command-args>/.test(this.text) ||
      /<command-message>/.test(this.text) ||
      /<local-command-stdout>/.test(this.text) ||
      /<user-memory-input>/.test(this.text)
    )
  }

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
      const fullCommand = commandArgs
        ? `${commandName} ${commandArgs}`
        : commandName
      output.push(`> \`${fullCommand}\`\\`)
    }
    if (commandMessage) {
      output.push(`> ${commandMessage}`)
    }

    if (stdout && stdout.length > 0) {
      output.push('```bash')
      output.push(...stdout.split('\n').map((line) => filterAnsi(line)))
      output.push('```')
    }

    // Fallback if no command elements found
    if (output.length === 0) {
      const lines = this.text.split('\n')
      output.push(...lines.map((line) => `> ${line}`))
    }

    return output
  }

  private extractTag(
    tagName: string,
    multiline: boolean = false,
  ): string | null {
    const pattern = multiline
      ? new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`)
      : new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`)

    const match = this.text.match(pattern)
    return match?.[1]?.trim() ?? null
  }
}
