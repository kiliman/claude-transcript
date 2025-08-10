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

function processUserEntry(entry: Entry, lineNumber: number): string {
  const output: string[] = [];
  
  if (typeof entry.message.content === 'string') {
    // Convert to blockquote
    const lines = entry.message.content.split('\n');
    output.push(...lines.map(line => `> ${line}`));
  } else if (typeof entry.message.content === 'object' && entry.message.content.type === 'tool_result') {
    // Output tool result content
    if (entry.message.content.content) {
      output.push('```');
      output.push(entry.message.content.content);
      output.push('```');
    }
    
    // Output toolUseResult
    if (entry.message.toolUseResult) {
      output.push('```json');
      output.push(JSON.stringify(entry.message.toolUseResult, null, 2));
      output.push('```');
    }
  } else {
    // Unknown format
    output.push(`## Unknown user line #${lineNumber}`);
    output.push('```json');
    output.push(JSON.stringify(entry, null, 2));
    output.push('```');
  }
  
  return output.join('\n');
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
        hasValidEntries = true;
        markdownSections.push(processUserEntry(entry, index + 1));
      } else if (entry.type === 'assistant') {
        hasValidEntries = true;
        markdownSections.push(processAssistantEntry(entry, index + 1));
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