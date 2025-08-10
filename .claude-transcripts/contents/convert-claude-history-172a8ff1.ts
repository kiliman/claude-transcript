function handleLargeContent(content: string, filePath?: string): { content: string; savedPath?: string; remainingLines?: number } {
  const lines = content.split('\n');
  const lineCount = lines.length;
  
  // If 12 lines or fewer, return as is
  if (lineCount <= 12) {
    return { content };
  }
  
  // Truncate to 8 lines
  const truncatedLines = lines.slice(0, 8);
  const remainingLines = lineCount - 8;
  
  // Generate hash for filename
  const hash = createHash('md5').update(content).digest('hex').substring(0, 8);
  
  // Extract extension from filePath if provided
  let extension = '';
  if (filePath) {
    const ext = filePath.split('.').pop();
    if (ext && ext !== filePath) {
      extension = `.${ext}`;
    }
  }
  
  // Create filename with hash
  const filename = `${filePath ? basename(filePath, extension).replace(/[^a-zA-Z0-9-_]/g, '_') + '-' : ''}${hash}${extension}`;
  const savedPath = join('contents', filename);
  
  // Ensure contents directory exists
  if (!existsSync('contents')) {
    mkdirSync('contents', { recursive: true });
  }
  
  // Save full content to file
  writeFileSync(savedPath, content);
  
  return { 
    content: truncatedLines.join('\n'),
    savedPath,
    remainingLines
  };
}

function getLanguageFromExtension(ext: string): string {
  const languageMap: { [key: string]: string } = {
    // JavaScript/TypeScript
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',