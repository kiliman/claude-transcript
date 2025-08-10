      if (entry.toolUseResult.file) {
        const file = entry.toolUseResult.file;
        output.push(file.filePath);

        // Determine language from file extension
        const ext = file.filePath.split('.').pop()?.toLowerCase() || '';
        const language = getLanguageFromExtension(ext);

        // Handle potentially large file content
        const { content: processedContent } = handleLargeContent(file.content, file.filePath);
        
        output.push(`\`\`\`${language}`);
        output.push(processedContent);
        output.push('```');
      } else {
        // Handle non-file toolUseResult
        const content = typeof entry.toolUseResult === 'string' 
          ? entry.toolUseResult 
          : JSON.stringify(entry.toolUseResult, null, 2);
        const { content: processedContent } = handleLargeContent(content);
        
        output.push('```');
        output.push(processedContent);
        output.push('```');
      }
    } else if (entry.message.content.content) {
      // Fallback to tool_result content if no toolUseResult
      const contentStr = typeof entry.message.content.content === 'string'
        ? entry.message.content.content
        : JSON.stringify(entry.message.content.content, null, 2);
      const { content: processedContent } = handleLargeContent(contentStr);
      
      output.push('```');
      output.push(processedContent);
      output.push('```');