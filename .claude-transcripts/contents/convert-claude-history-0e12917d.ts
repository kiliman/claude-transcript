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
        } else if (contentItem.content) {
          // Fallback to tool_result content if no toolUseResult
          output.push('```');
          const contentStr = typeof contentItem.content === 'string'
            ? contentItem.content
            : JSON.stringify(contentItem.content, null, 2);
          output.push(contentStr);