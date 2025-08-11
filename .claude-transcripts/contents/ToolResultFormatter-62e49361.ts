      return this.formatContent(toolUseResult.content, resultItem)
    }

    // Fallback
    return this.formatOutput({
      content: JSON.stringify(toolUseResult, null, 2),
      label: `Tool Use Result: UNKNOWN Line ${resultItem.lineNumber}`,
    })
  }

  private formatFileResult(file: File): string {
    return this.formatOutput({
      saveOnly: this.shouldSaveOnly(),
      content: file.content,
      filePath: file.filePath,
    })
  }

  private formatTodos(todos: Todo[]): string {
    return todos
      .map((todo) => {
        const checked = todo.status === 'completed' ? 'x' : ' '
        const inProgress = todo.status === 'in_progress' ? ' ⏳' : ''
        const priority = todo.priority === 'high' ? '⚡️' : ''
        return `- [${checked}]${inProgress} ${todo.content} ${priority}`
      })
      .join('\n')
  }

  private formatPatch(