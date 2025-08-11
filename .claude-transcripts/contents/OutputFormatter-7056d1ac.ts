      const ext = filePath.split('.').pop()
      if (ext && ext !== filePath) {
        extension = `.${ext}`
      }
      baseFileName = basename(filePath, extension).replace(
        /[^a-zA-Z0-9-_]/g,
        '_',
      )
    }

    const filename = `${baseFileName}-${hash}${extension}`
    const savedPath = join('.claude-transcripts/contents', filename)

    writeFileSync(savedPath, content, 'utf-8')

    return join('contents', filename)
  }

  formatTextContent(
    item: Item,