        this.metaEntry = entry
      }

      // Track last timestamp
      if (entry.timestamp) {
        this.lastTimestamp = entry.timestamp
      }

      // Capture first user prompt (not command elements)
      if (!this.firstUserPrompt && entry.type === 'user' && !entry.isMeta) {
        const content = entry.message?.content
        if (typeof content === 'string') {
          this.firstUserPrompt = content
        } else if (Array.isArray(content)) {
          // Look for first text content
          const textContent = content.find((c) => c.type === 'text' && c.text)
          if (textContent?.text) {
            this.firstUserPrompt = textContent.text
          }
        }
      }

      const state: StateType = entry.isMeta === true ? 'skipped' : 'pending'

      const item: Item = {
        uuid: entry.uuid,
        parentUuid: entry.parentUuid || null,
        lineNumber,
        state,
        entry,
      }

      this.itemTree.set(item.uuid, item)
      this.entryList.push(entry.uuid)

      // Build tool use/result relationships
      const toolUseId = this.getToolUseId(entry)
      if (toolUseId) {
        this.toolUseTree.set(toolUseId, [])
      }

      const toolUseResultId = this.getToolResultId(entry)
      if (toolUseResultId) {
        const existingResults = this.toolUseTree.get(toolUseResultId) || []
        existingResults.push(entry)
        this.toolUseTree.set(toolUseResultId, existingResults)

        if (existingResults.length > 1) {
          console.warn(
            'Found multiple tool results for tool_use_id:',