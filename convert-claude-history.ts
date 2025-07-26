import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

interface Message {
  type: string;
  content: string | any[] | { type: string; content?: string; [key: string]: any };
  toolUseResult?: any;
}

interface Entry {
  type: string;
  message: Message;
  isMeta?: boolean;
}

function processUserEntry(entry: Entry, lineNumber: number): string | null {
  const output: string[] = [];

  if (typeof entry.message.content === 'string') {

    // Parse for command elements
    const text = entry.message.content;
    if (text.includes('<command-name>') || text.includes('<local-command-stdout>')) {
      const parsed = parseCommandContent(text);
      if (parsed === null) return null; // Skip empty stdout entries
      output.push(...parsed);
    } else {
      // Convert to blockquote
      const lines = text.split('\n');
      output.push(...lines.map(line => `> ${line}`));
    }
  } else if (Array.isArray(entry.message.content)) {
    // Handle array format (common in newer entries)
    for (const contentItem of entry.message.content) {
      if (contentItem.type === 'text' && contentItem.text) {
        const text = contentItem.text;
        // Parse for command elements
        if (text.includes('<command-name>') || text.includes('<local-command-stdout>')) {
          const parsed = parseCommandContent(text);
          if (parsed === null) return null; // Skip empty stdout entries
          output.push(...parsed);
        } else {
          // Convert text to blockquote
          const lines = text.split('\n');
          output.push(...lines.map(line => `> ${line}`));
        }
      } else if (contentItem.type === 'tool_result') {
        // Output tool result content with blockquotes
        if (contentItem.content) {
          output.push('> ```');
          const contentStr = typeof contentItem.content === 'string'
            ? contentItem.content
            : JSON.stringify(contentItem.content, null, 2);
          const contentLines = contentStr.split('\n');
          output.push(...contentLines.map(line => `> ${line}`));
          output.push('> ```');
        }

        // Output toolUseResult if available at the message level
        if (entry.message.toolUseResult) {
          output.push('> ```json');
          const jsonLines = JSON.stringify(entry.message.toolUseResult, null, 2).split('\n');
          output.push(...jsonLines.map(line => `> ${line}`));
          output.push('> ```');
        }
      }
    }
  } else if (typeof entry.message.content === 'object' && entry.message.content.type === 'tool_result') {
    // Output tool result content with blockquotes
    if (entry.message.content.content) {
      output.push('> ```');
      const contentStr = typeof entry.message.content.content === 'string'
        ? entry.message.content.content
        : JSON.stringify(entry.message.content.content, null, 2);
      const contentLines = contentStr.split('\n');
      output.push(...contentLines.map(line => `> ${line}`));
      output.push('> ```');
    }

    // Output toolUseResult
    if (entry.message.toolUseResult) {
      output.push('> ```json');
      const jsonLines = JSON.stringify(entry.message.toolUseResult, null, 2).split('\n');
      output.push(...jsonLines.map(line => `> ${line}`));
      output.push('> ```');
    }
  } else {
    // Unknown format
    output.push(`## Unknown user line #${lineNumber}`);
    output.push('```json');
    output.push(JSON.stringify(entry, null, 2));
    output.push('```');
  }

  return output.length > 0 ? output.join('\n') : null;
}

function parseCommandContent(text: string): string[] | null {
  const output: string[] = [];

  // Extract command name
  const commandNameMatch = text.match(/<command-name>([^<]*)<\/command-name>/);
  const commandName = commandNameMatch ? commandNameMatch[1].trim() : '';

  // Extract command args
  const commandArgsMatch = text.match(/<command-args>([^<]*)<\/command-args>/);
  const commandArgs = commandArgsMatch ? commandArgsMatch[1].trim() : '';

  // Extract command message
  const commandMessageMatch = text.match(/<command-message>([^<]*)<\/command-message>/);
  const commandMessage = commandMessageMatch ? commandMessageMatch[1].trim() : '';

  // Extract stdout
  const stdoutMatch = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  const stdout = stdoutMatch ? stdoutMatch[1].trim() : '';

  // If this is just an empty stdout entry, skip it entirely
  if (!commandName && stdoutMatch && !stdout) {
    return null;
  }

  // Format command if we have it
  if (commandName) {
    const fullCommand = commandArgs ? `${commandName} ${commandArgs}` : commandName;
    output.push(`> \`${fullCommand}\`\\`);
  }
  if (commandMessage) {
    output.push(`> ${commandMessage}`);
  }

  // Add stdout in bash code fence if present and not empty
  if (stdout && stdout.length > 0) {
    output.push('> ```bash');
    const stdoutLines = stdout.split('\n');
    output.push(...stdoutLines.map(line => `> ${line}`));
    output.push('> ```');
  }

  // If we didn't find any command elements, output as blockquote
  if (output.length === 0) {
    const lines = text.split('\n');
    output.push(...lines.map(line => `> ${line}`));
  }

  return output;
}

function processAssistantEntry(entry: Entry, lineNumber: number): string {
  const output: string[] = [];

  if (entry.message.type === 'message' && Array.isArray(entry.message.content)) {
    for (const contentItem of entry.message.content) {
      if (contentItem.type === 'text' && contentItem.text) {
        output.push(contentItem.text);
      } else if (contentItem.type === 'tool_use') {
        output.push('```json');
        output.push(JSON.stringify(contentItem, null, 2));
        output.push('```');
      }
    }
  } else {
    // Unknown format
    output.push(`## Unknown assistant line #${lineNumber}`);
    output.push('```json');
    output.push(JSON.stringify(entry, null, 2));
    output.push('```');
  }

  return output.join('\n');
}

function convertJsonlToMarkdown(jsonlPath: string): string | null {
  const content = readFileSync(jsonlPath, 'utf-8');
  const lines = content.trim().split('\n');
  const markdownSections: string[] = [];

  let hasValidEntries = false;

  lines.forEach((line, index) => {
    if (!line.trim()) return;

    try {
      const entry: Entry = JSON.parse(line);

      // Skip meta entries
      if (entry.isMeta === true) return;

      // Process user and assistant entries
      if (entry.type === 'user') {
        const processed = processUserEntry(entry, index + 1);
        if (processed !== null) {
          hasValidEntries = true;
          markdownSections.push(`### Line #${index + 1}\n\n${processed}`);
        }
      } else if (entry.type === 'assistant') {
        hasValidEntries = true;
        markdownSections.push(`### Line #${index + 1}\n\n${processAssistantEntry(entry, index + 1)}`);
      }
    } catch (error) {
      console.error(`Error parsing line ${index + 1} in ${jsonlPath}:`, error);
    }
  });

  if (!hasValidEntries) {
    return null;
  }

  // Join sections with blank lines between them
  return markdownSections.join('\n\n');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length !== 1) {
    console.error('Usage: node convert-claude-history.js <path-to-jsonl-folder>');
    process.exit(1);
  }

  const jsonlFolderPath = args[0];

  if (!existsSync(jsonlFolderPath)) {
    console.error(`Error: Directory not found: ${jsonlFolderPath}`);
    process.exit(1);
  }

  // Read all JSONL files in the folder
  const files = readdirSync(jsonlFolderPath);
  const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

  if (jsonlFiles.length === 0) {
    console.log('No JSONL files found in the specified directory.');
    return;
  }

  console.log(`Found ${jsonlFiles.length} JSONL file(s) to process...`);

  jsonlFiles.forEach(file => {
    const jsonlPath = join(jsonlFolderPath, file);
    const markdownContent = convertJsonlToMarkdown(jsonlPath);

    if (markdownContent !== null) {
      const mdFileName = basename(file, '.jsonl') + '.md';
      writeFileSync(mdFileName, markdownContent);
      console.log(`✓ Created ${mdFileName}`);
    } else {
      console.log(`⚠ Skipped ${file} (no valid entries found)`);
    }
  });

  console.log('Done!');
}

main();