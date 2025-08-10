          // Check if toolUseResult has a file object
          if (entry.toolUseResult.file) {
            const file = entry.toolUseResult.file;
            output.push(file.filePath);

            // Determine language from file extension
            const ext = file.filePath.split('.').pop()?.toLowerCase() || '';
            const language = getLanguageFromExtension(ext);

            // Handle potentially large file content
            const { content: processedContent, savedPath, remainingLines } = handleLargeContent(file.content, file.filePath);
            
            output.push(`\`\`\`${language}`);
            output.push(processedContent);
            output.push('```');
            
            // Add truncation notice outside code fence
            if (savedPath && remainingLines) {
              output.push(`... +${remainingLines} lines ([view file](${savedPath}))`);
            }
          } else {
            // Handle non-file toolUseResult
            const content = typeof entry.toolUseResult === 'string' 
              ? entry.toolUseResult 
              : JSON.stringify(entry.toolUseResult, null, 2);
            const { content: processedContent, savedPath, remainingLines } = handleLargeContent(content);
            
            output.push('```');
            output.push(processedContent);
            output.push('```');