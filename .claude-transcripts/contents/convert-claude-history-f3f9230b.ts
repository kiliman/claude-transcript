        // Determine language from file extension
        const ext = file.filePath.split('.').pop()?.toLowerCase() || '';
        const language = getLanguageFromExtension(ext);

        output.push(`\`\`\`${language}`);
        output.push(file.content);
        output.push('```');
      } else {
        output.push('```');
        output.push(JSON.stringify(entry.toolUseResult, null, 2));
        output.push('```');
      }
    } else if (entry.message.content.content) {
      // Fallback to tool_result content if no toolUseResult
      output.push('```');