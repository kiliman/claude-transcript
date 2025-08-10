import { z } from 'zod'

const InputSchema = z.object({
  command: z.string().optional(),
  description: z.string().optional(),
  prompt: z.string().optional(),
  pattern: z.string().optional(),
  path: z.string().optional(),
  file_path: z.string().optional(),
  url: z.string().optional(),
})

const SourceSchema = z.object({
  type: z.enum(['base64']),
  media_type: z.enum(['image/png']),
  data: z.string(),
})
const FileSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  numLines: z.number(),
  startLine: z.number(),
  totalLines: z.number(),
})
const StructuredPatchSchema = z.object({
  oldStart: z.number(),
  oldLines: z.number(),
  newStart: z.number(),
  newLines: z.number(),
  lines: z.array(z.string()),
})

// Content schema
const ContentSchema = z.object({
  type: z
    .enum(['text', 'tool_use', 'tool_result', 'image', 'thinking'])
    .optional(),
  id: z.string().optional(),
  name: z.string().optional(),
  text: z.string().optional(),
  input: InputSchema.optional(),
  tool_use_id: z.string().optional(),
  get content() {
    return z.union([z.string(), z.array(ContentSchema)]).optional()
  },
  is_error: z.boolean().optional(),
  source: SourceSchema.optional(),
  file: FileSchema.optional(),
  thinking: z.string().optional(),
})

const TodoSchema = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  priority: z.enum(['low', 'medium', 'high']),
  id: z.string(),
})

const ToolUseResultSchema = z.object({
  type: z.enum(['text', 'create', 'update']).optional(),
  file: FileSchema.optional(),
  filePath: z.string().optional(),
  filenames: z.array(z.string()).optional(),
  text: z.string().optional(),
  content: z
    .union([z.string(), ContentSchema, z.array(ContentSchema)])
    .optional(),
  oldTodos: z.array(TodoSchema).optional(),
  newTodos: z.array(TodoSchema).optional(),
  structuredPatch: z.array(StructuredPatchSchema).optional(),
  stdout: z.string().optional(),
  stderr: z.string().optional(),
  interrupted: z.boolean().optional(),
  isImage: z.boolean().optional(),
  result: z.string().optional(),
  url: z.string().optional(),
})

// Message schema
const MessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant']),
  type: z.enum(['message']).optional(),
  content: z.union([z.string(), z.array(ContentSchema)]),
})

// Entry schema
const EntrySchema = z.object({
  uuid: z.string().optional(),
  parentUuid: z.string().nullable().optional(),
  type: z.enum(['user', 'assistant', 'summary']),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean(),
  message: MessageSchema.optional(),
  toolUseResult: z.union([z.string(), ToolUseResultSchema]).optional(),
  cwd: z.string().optional(),
  timestamp: z.string().optional(),
  sessionId: z.string().optional(),
  version: z.string().optional(),
  gitBranch: z.string().optional(),
  userType: z.string().optional(),
})

// StateType schema
const StateTypeSchema = z.enum([
  'pending',
  'processing',
  'processed',
  'skipped',
])

// Item schema
const ItemSchema = z.object({
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  lineNumber: z.number(),
  state: StateTypeSchema,
  entry: EntrySchema,
})

// Export all schemas
export {
  ContentSchema,
  MessageSchema,
  EntrySchema,
  StateTypeSchema,
  ItemSchema,
}

// Type inference (optional - you can derive TypeScript types from these schemas)
export type Input = z.infer<typeof InputSchema>
export type Source = z.infer<typeof SourceSchema>
export type File = z.infer<typeof FileSchema>
export type Todo = z.infer<typeof TodoSchema>
export type StructuredPatch = z.infer<typeof StructuredPatchSchema>
export type ToolUseResult = z.infer<typeof ToolUseResultSchema>
export type Content = z.infer<typeof ContentSchema>
export type Message = z.infer<typeof MessageSchema>
export type Entry = z.infer<typeof EntrySchema>
export type StateType = z.infer<typeof StateTypeSchema>
export type Item = z.infer<typeof ItemSchema>
