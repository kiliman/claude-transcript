    if (label) output.push(label)

    // Determine if this is a diff file
    const effectiveFilePath = content.startsWith('diff --git')
      ? filePath || 'diff.patch'
      : filePath

    // Process content
    const processed = this.processContent({
      saveOnly,
      content,
      ...(fileContent !== undefined && { fileContent }),
      ...(effectiveFilePath !== undefined && { filePath: effectiveFilePath }),
      codeFence,
    })

    if (saveOnly) {
      output.push(`([view file](${processed.savedPath}))`)
    } else {
      if (codeFence) {
        const language = effectiveFilePath
          ? getLanguageFromExtension(effectiveFilePath)
          : ''
        output.push(`\`\`\`${language}`)
      }
      output.push(processed.content)
      if (codeFence) {
        output.push('```')
      }

      if (processed.savedPath) {
        const notice = processed.remainingLines
          ? `... +${processed.remainingLines} lines `
          : ''
        output.push(`${notice}([view file](${processed.savedPath}))`)
      }
    }

    return output.join('\n')
  }