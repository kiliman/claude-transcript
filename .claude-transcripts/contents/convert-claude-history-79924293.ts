    if (entry.toolUseResult) {
      // Check if toolUseResult has a file object
      if (entry.toolUseResult.file) {
        const file = entry.toolUseResult.file;
        output.push(file.filePath);

        // Determine language from file extension
        const ext = file.filePath.split('.').pop()?.toLowerCase() || '';
        const language = getLanguageFromExtension(ext);

        output.push(`\`\`\`${language}`);
        output.push(file.content);
        output.push('```');
      } else {
        output.push('```');
        output.push(typeof entry.toolUseResult === 'string' 
          ? entry.toolUseResult 
          : JSON.stringify(entry.toolUseResult, null, 2));
        output.push('```');
      }
    } else if (entry.message.content.content) {
      // Fallback to tool_result content if no toolUseResult
      output.push('```');
      const contentStr = typeof entry.message.content.content === 'string'
        ? entry.message.content.content
        : JSON.stringify(entry.message.content.content, null, 2);
      output.push(contentStr);
      output.push('```');
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
