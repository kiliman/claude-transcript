
    // Determine if this is a diff file
    const effectiveFilePath = content.startsWith('diff --git')
      ? filePath || 'diff.patch'
      : filePath

    // Process content
    const processed = this.processContent({
      saveOnly,
      content,
      fileContent,
      filePath: effectiveFilePath,
      codeFence,
    })

    if (saveOnly) {
      output.push(`([view file](${processed.savedPath}))`)
    } else {
      if (codeFence) {
        const language = effectiveFilePath