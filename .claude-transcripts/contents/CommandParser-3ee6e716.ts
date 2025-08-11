    multiline: boolean = false,
  ): string | null {
    const pattern = multiline
      ? new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`)
      : new RegExp(`<${tagName}>([^<]*)<\\/${tagName}>`)

    const match = this.text.match(pattern)
    return match ? match[1].trim() : null
  }
}