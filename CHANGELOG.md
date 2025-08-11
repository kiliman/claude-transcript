# CHANGELOG

## v1.2.0

- ✨ Show relative paths in tool descriptions for better readability
  - Converts absolute file paths to relative paths when within current working directory
  - Keeps absolute paths when relative would contain `..` (outside cwd)
  - Makes transcripts more portable and easier to read

## v1.1.0

- ✨ Add `--output` option to specify custom output directory
- ✨ Read version dynamically from package.json
- ♻️ Refactor JsonlToMarkdownConverter to use options object pattern for better extensibility
- ♻️ Move all formatting methods to OutputFormatter class for better organization
- ✨ Add TypeScript type checking with strict mode
- ✨ Add Biome for linting and formatting (replacing Prettier)
- ✨ Configure TypeScript and Biome to reject type stripping incompatible syntax
- 📝 Add documentation for TypeScript type stripping safety

## v1.0.1

- 🐛 Ensure that the generated filename is unique across duplicate sessions

## v1.0.0

- 🎉 Initial release
