// Handles output formatting with truncation and file saving
class OutputFormatter {
  constructor(private defaultSaveOnly: boolean) {}

  format(options: {