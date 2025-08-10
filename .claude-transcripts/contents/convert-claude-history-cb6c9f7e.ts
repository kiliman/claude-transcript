    'xml': 'xml',
    
    // Programming languages
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'cxx': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'r': 'r',
    'lua': 'lua',
    'dart': 'dart',
    'elm': 'elm',
    'clj': 'clojure',
    'ex': 'elixir',
    'exs': 'elixir',
    
    // Shell/Scripts
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'fish': 'fish',
    'ps1': 'powershell',
    'bat': 'batch',
    'cmd': 'batch',
    
    // Config files
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'conf',
    'properties': 'properties',
    'env': 'bash',
    
    // Documentation
    'md': 'markdown',
    'markdown': 'markdown',
    'rst': 'rst',
    'tex': 'latex',
    
    // Database
    'sql': 'sql',
    
    // Other
    'dockerfile': 'dockerfile',
    'makefile': 'makefile',
    'mk': 'makefile',
    'diff': 'diff',
    'patch': 'diff',
  };
  
  return languageMap[ext] || '';
}

function processUserEntry(entry: Entry, lineNumber: number): string | null {
  const output: string[] = [];

  if (typeof entry.message.content === 'string') {

    // Parse for command elements
    const text = entry.message.content;
    if (text.includes('<command-name>') || text.includes('<local-command-stdout>')) {
      const parsed = parseCommandContent(text);
      if (parsed === null) return null; // Skip empty stdout entries
      output.push(...parsed);
    } else {
      // Convert to blockquote
      const lines = text.split('\n');
      output.push(...lines.map(line => `> ${line}`));
    }
  } else if (Array.isArray(entry.message.content)) {
    // Handle array format (common in newer entries)