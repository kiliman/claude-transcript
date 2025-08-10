}

function parseCommandContent(text: string): string[] | null {
  const output: string[] = [];

  // Extract command name
  const commandNameMatch = text.match(/<command-name>([^<]*)<\/command-name>/);
  const commandName = commandNameMatch ? commandNameMatch[1].trim() : '';

  // Extract command args
  const commandArgsMatch = text.match(/<command-args>([^<]*)<\/command-args>/);
  const commandArgs = commandArgsMatch ? commandArgsMatch[1].trim() : '';

  // Extract command message
  const commandMessageMatch = text.match(/<command-message>([^<]*)<\/command-message>/);
  const commandMessage = commandMessageMatch ? commandMessageMatch[1].trim() : '';

  // Extract stdout
  const stdoutMatch = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
  const stdout = stdoutMatch ? stdoutMatch[1].trim() : '';

  // If this is just an empty stdout entry, skip it entirely
  if (!commandName && stdoutMatch && !stdout) {
    return null;
  }

  // Format command if we have it
  if (commandName) {
    const fullCommand = commandArgs ? `${commandName} ${commandArgs}` : commandName;
    output.push(`> \`${fullCommand}\`\\`);
  }
  if (commandMessage) {
    output.push(`> ${commandMessage}`);
  }

  // Add stdout in bash code fence if present and not empty
  if (stdout && stdout.length > 0) {
    output.push('> ```bash');
    const stdoutLines = stdout.split('\n');
    output.push(...stdoutLines.map(line => `> ${line}`));
    output.push('> ```');
  }

  // If we didn't find any command elements, output as blockquote
  if (output.length === 0) {
    const lines = text.split('\n');
    output.push(...lines.map(line => `> ${line}`));
  }

  return output;