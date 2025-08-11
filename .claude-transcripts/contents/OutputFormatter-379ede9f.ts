    if (
      contentItem.type === 'image' &&
      contentItem.source &&
      contentItem.source.type === 'base64' &&
      typeof contentItem.source.data === 'string'
    ) {
      const filename = createImageFile(
        contentItem.source.data,
        contentItem.source.media_type,
        item.uuid,
      )
      return `![Image](contents/${filename})`
    }

    return [