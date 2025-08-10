class CommandParser {
  constructor(private text: string) {}

  hasCommandElements(): boolean {
    return (
      /<command-name>/.test(this.text) ||
      /<command-args>/.test(this.text) ||
      /<command-message>/.test(this.text) ||
      /<local-command-stdout>/.test(this.text) ||
      /<user-memory-input>/.test(this.text)