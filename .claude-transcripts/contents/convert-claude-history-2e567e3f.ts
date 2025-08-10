    const match = this.text.match(pattern)
    return match ? match[1].trim() : null
  }
}

// Handles formatting of tool results
class ToolResultFormatter {
  constructor(
    private toolName: string,
    private isDebug: boolean,