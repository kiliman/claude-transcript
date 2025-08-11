  uuid?: string,
): string {
  const hash = createHash('md5')
    .update(base64Data)
    .digest('hex')
    .substring(0, 8)
  const extension = mediaType.split('/')[1] || 'png'
  const filename = `image-${uuid || hash}.${extension}`
  const savedPath = join('.claude-transcripts/contents', filename)

  // Write the image file
  writeFileSync(savedPath, Buffer.from(base64Data, 'base64'))

  return filename
}
