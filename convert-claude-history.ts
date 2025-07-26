import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';

interface Message {
  type: string;
  content: string | any[] | { type: string; content?: string; [key: string]: any };
  toolUseResult?: any;
}

interface Entry {
  type: string;
  message: Message;
  isMeta?: boolean;
  toolUseResult?: any;
}

function escapeCodeFences(content: string): string {
  // Replace ``` with \`\`\` to escape code fences in markdown
  return content.replace(/```/g, '\\`\\`\\`');
}

function handleLargeContent(content: string, filePath?: string): { content: string; savedPath?: string; remainingLines?: number } {
  const lines = content.split('\n');
  const lineCount = lines.length;
  
  // If 12 lines or fewer, return as is (but escaped for markdown)
  if (lineCount <= 12) {
    return { content: escapeCodeFences(content) };
  }
  
  // Truncate to 8 lines
  const truncatedLines = lines.slice(0, 8);
  const remainingLines = lineCount - 8;
  
  // Generate hash for filename
  const hash = createHash('md5').update(content).digest('hex').substring(0, 8);
  
  // Extract extension and basename from filePath
  let extension = '';
  let baseFileName = 'results'; // Default basename when no filePath provided
  
  if (filePath) {
    const ext = filePath.split('.').pop();
    if (ext && ext !== filePath) {
      extension = `.${ext}`;
    }
    baseFileName = basename(filePath, extension).replace(/[^a-zA-Z0-9-_]/g, '_');
  }
  
  // Create filename with basename-hash.extension format
  const filename = `${baseFileName}-${hash}${extension}`;
  const savedPath = join('contents', filename);
  
  // Ensure contents directory exists
  if (!existsSync('contents')) {
    mkdirSync('contents', { recursive: true });
  }
  
  // Save full content to file (raw, unescaped)
  writeFileSync(savedPath, content);
  
  return { 
    content: escapeCodeFences(truncatedLines.join('\n')),
    savedPath,
    remainingLines
  };
}

function getLanguageFromExtension(ext: string): string {
  const languageMap: { [key: string]: string } = {
    // JavaScript/TypeScript
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'mjs': 'javascript',
    'cjs': 'javascript',

    // Web
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',

    // Data formats
    'json': 'json',
    'jsonl': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'toml': 'toml',
    'xml': 'xml',

    // Programming languages
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'r': 'r',
    'lua': 'lua',
    'dart': 'dart',
    'elm': 'elm',
    'clj': 'clojure',
    'ex': 'elixir',
    'exs': 'elixir',

    // Shell/Scripts
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'fish',
    'ps1': 'powershell',
    'bat': 'batch',
    'cmd': 'batch',

    // Config files
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'conf',
    'properties': 'properties',
    'env': 'bash',

    // Documentation
    'md': 'markdown',
    'markdown': 'markdown',
    'rst': 'rst',
    'tex': 'latex',

    // Database
    'sql': 'sql',

    // Other
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'mk': 'makefile',
    'diff': 'diff',
    'patch': 'diff',
  };

  return languageMap[ext] || '';
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
        // Prefer toolUseResult over tool_result content
        if (entry.toolUseResult) {
          // Check if toolUseResult has a file object
          if (entry.toolUseResult.file) {
            const file = entry.toolUseResult.file;
            output.push(file.filePath);

            // Determine language from file extension
            const ext = file.filePath.split('.').pop()?.toLowerCase() || '';
            const language = getLanguageFromExtension(ext);

            // Handle potentially large file content
            const { content: processedContent, savedPath, remainingLines } = handleLargeContent(file.content, file.filePath);
            
            output.push(`\`\`\`${language}`);
            output.push(processedContent);
            output.push('```');
            
            // Add truncation notice outside code fence
            if (savedPath && remainingLines) {
              output.push(`... +${remainingLines} lines ([view file](${savedPath}))`);
            }
          } else {
            // Handle non-file toolUseResult
            const content = typeof entry.toolUseResult === 'string' 
              ? entry.toolUseResult 
              : JSON.stringify(entry.toolUseResult, null, 2);
            const { content: processedContent, savedPath, remainingLines } = handleLargeContent(content);
            
            output.push('```');
            output.push(processedContent);
            output.push('```');
            
            // Add truncation notice outside code fence
            if (savedPath && remainingLines) {
              output.push(`... +${remainingLines} lines ([view file](${savedPath}))`);
            }
          }
        } else if (contentItem.content) {
          // Fallback to tool_result content if no toolUseResult
          const contentStr = typeof contentItem.content === 'string'
            ? contentItem.content
            : JSON.stringify(contentItem.content, null, 2);
          const { content: processedContent, savedPath, remainingLines } = handleLargeContent(contentStr);
          
          output.push('```');
          output.push(processedContent);
          output.push('```');
          
          // Add truncation notice outside code fence
          if (savedPath && remainingLines) {
            output.push(`... +${remainingLines} lines ([view file](${savedPath}))`);
          }
        }
      }
    }
  } else if (typeof entry.message.content === 'object' && entry.message.content.type === 'tool_result') {
    // Prefer toolUseResult over tool_result content
    if (entry.toolUseResult) {
      // Check if toolUseResult has a file object
      if (entry.toolUseResult.file) {
        const file = entry.toolUseResult.file;
        output.push(file.filePath);

        // Determine language from file extension
        const ext = file.filePath.split('.').pop()?.toLowerCase() || '';
        const language = getLanguageFromExtension(ext);

        // Handle potentially large file content
        const { content: processedContent, savedPath, remainingLines } = handleLargeContent(file.content, file.filePath);
        
        output.push(`\`\`\`${language}`);
        output.push(processedContent);
        output.push('```');
        
        // Add truncation notice outside code fence
        if (savedPath && remainingLines) {
          output.push(`... +${remainingLines} lines ([view file](${savedPath}))`);
        }
      } else {
        // Handle non-file toolUseResult
        const content = typeof entry.toolUseResult === 'string' 
          ? entry.toolUseResult 
          : JSON.stringify(entry.toolUseResult, null, 2);
        const { content: processedContent, savedPath, remainingLines } = handleLargeContent(content);
        
        output.push('```');
        output.push(processedContent);
        output.push('```');
        
        // Add truncation notice outside code fence
        if (savedPath && remainingLines) {
          output.push(`... +${remainingLines} lines ([view file](${savedPath}))`);
        }
      }
    } else if (entry.message.content.content) {
      // Fallback to tool_result content if no toolUseResult
      const contentStr = typeof entry.message.content.content === 'string'
        ? entry.message.content.content
        : JSON.stringify(entry.message.content.content, null, 2);
      const { content: processedContent, savedPath, remainingLines } = handleLargeContent(contentStr);
      
      output.push('```');
      output.push(processedContent);
      output.push('```');
      
      // Add truncation notice outside code fence
      if (savedPath && remainingLines) {
        output.push(`... +${remainingLines} lines ([view file](${savedPath}))`);
      }
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
        output.push(escapeCodeFences(contentItem.text));
      } else if (contentItem.type === 'tool_use') {
        // Format tool use with emoji and name
        const toolName = contentItem.name || 'Unknown Tool';
        const description = contentItem.input?.description || contentItem.input?.path || contentItem.input?.file_path || '';
        output.push(`🛠️ ${toolName}: ${description}`);
      }
    }
  } else if (entry.message.type === 'tool_use') {
    // Handle direct tool_use message type
    const toolName = entry.message.name || 'Unknown Tool';
    const description = entry.message.input?.description || entry.message.input?.path || entry.message.input?.file_path || '';
    output.push(`🛠️ ${toolName}: ${description}`);
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