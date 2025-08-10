          const lines = text.split('\n');
          output.push(...lines.map(line => `> ${line}`));
        }
      } else if (contentItem.type === 'tool_result') {
        // Prefer toolUseResult over tool_result content
        if (entry.message.toolUseResult) {
          // Check if toolUseResult has a file object
          if (entry.message.toolUseResult.file) {
            const file = entry.message.toolUseResult.file;
            output.push(file.filePath);
            
            // Determine language from file extension
            const ext = file.filePath.split('.').pop()?.toLowerCase() || '';
            const language = getLanguageFromExtension(ext);
            
            output.push(`\`\`\`${language}`);
            output.push(file.content);
            output.push('```');
          } else {
            output.push('```json');
            output.push(JSON.stringify(entry.message.toolUseResult, null, 2));
            output.push('```');
          }
        } else if (contentItem.content) {
          // Fallback to tool_result content if no toolUseResult
          output.push('```');
          const contentStr = typeof contentItem.content === 'string'
            ? contentItem.content
            : JSON.stringify(contentItem.content, null, 2);
          output.push(contentStr);
          output.push('```');
        }
      }
    }
  } else if (typeof entry.message.content === 'object' && entry.message.content.type === 'tool_result') {
    // Prefer toolUseResult over tool_result content
    if (entry.message.toolUseResult) {
      // Check if toolUseResult has a file object
      if (entry.message.toolUseResult.file) {
        const file = entry.message.toolUseResult.file;