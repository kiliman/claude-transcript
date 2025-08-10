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