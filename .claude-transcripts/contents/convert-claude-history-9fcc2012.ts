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