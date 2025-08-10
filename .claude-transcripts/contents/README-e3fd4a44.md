# claude-transcript

Convert Claude Code JSONL conversation files to readable markdown transcripts.

## Features

- 🚀 Auto-detects JSONL files from `~/.claude/projects/` directory
- 📝 Converts conversations to clean, readable markdown format
- 🖼️ Preserves images by extracting them to the output directory
- 🛠️ Formats tool usage with appropriate emojis and syntax highlighting
- 📂 Organizes output in `.claude-transcripts/` directory
- 🏷️ Generates descriptive filenames with timestamps and conversation preview
- 🎯 Filters out internal tool results for cleaner transcripts

## Installation

You can run claude-transcript directly using npx (no installation required):

```bash
npx claude-transcript
```

Or install it globally:

```bash
npm install -g claude-transcript
```

## Usage

### Basic Usage

Run in your project directory to auto-detect JSONL files:

```bash
npx claude-transcript
```

This will look for JSONL files in `~/.claude/projects/<sanitized-current-directory>/`

### Specify JSONL Directory

You can also specify a custom JSONL directory:

```bash
npx claude-transcript /path/to/jsonl/folder
```

### Debug Mode

For detailed output including line numbers and processing information:

```bash
npx claude-transcript --debug
```

## Output

Transcripts are saved to `.claude-transcripts/` in your current directory with:
- Markdown files named with timestamp and first 5 words of conversation
- Images extracted to `.claude-transcripts/contents/`
- Clean formatting with:
  - User messages in blockquotes
  - Tool usage with emojis and syntax highlighting
  - Filtered grep/glob results for readability

## Example Output

```markdown
# 🤖 Claude Code Transcript
## 🗂️ ~/Projects/my-app
🕒 2025-01-22 18:19:02 - 2025-01-22 18:45:23

> [!IMPORTANT]
> Help me refactor this code to be more maintainable

I'll help you refactor the code. Let me first examine the current structure...

📖 **Read: `src/index.ts`**
```

## Requirements

- Node.js v24 or higher (uses native TypeScript support)

## Development

1. Clone the repository:
```bash
git clone https://github.com/kiliman/claude-transcript.git
cd claude-transcript
```

2. Install dependencies:
```bash
pnpm install
```

3. Run locally:
```bash
node --experimental-strip-types src/index.ts
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Issues

If you find any bugs or have feature requests, please file them at [https://github.com/kiliman/claude-transcript/issues](https://github.com/kiliman/claude-transcript/issues)