
interface Entry {
  type: string;
  message: Message;
  isMeta?: boolean;
  toolUseResult?: any;
}

function escapeCodeFences(content: string): string {
  // Replace ``` with \`\`\` to escape code fences in markdown