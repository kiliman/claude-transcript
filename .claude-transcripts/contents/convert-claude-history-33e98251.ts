function processAssistantEntry(entry: Entry, lineNumber: number): string {
  const output: string[] = [];

  if (entry.message.type === 'message' && Array.isArray(entry.message.content)) {
    for (const contentItem of entry.message.content) {
      if (contentItem.type === 'text' && contentItem.text) {
        output.push(contentItem.text);
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
