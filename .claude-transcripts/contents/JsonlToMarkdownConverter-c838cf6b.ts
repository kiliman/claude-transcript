        `Entry with UUID ${entry.uuid} has no message or content on line #${lineNumber}`,
      )
      return null
    }

    console.log(`#${lineNumber} ${entry.type}`)
    if (this.isDebug) {
      output.push(
        `## Line ${lineNumber} ${entry.type} (isSidechain: ${entry.isSidechain})`,
      )