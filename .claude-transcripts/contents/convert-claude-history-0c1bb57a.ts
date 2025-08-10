
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