import { tool, type Plugin } from "@opencode-ai/plugin"
import { buildMemorySystemPrompt } from "./prompt.js"
import { getMemoryDir } from "./paths.js"
import {
  saveMemory,
  deleteMemory,
  listMemories,
  searchMemories,
  readMemory,
  MEMORY_TYPES,
  type MemoryType,
} from "./memory.js"
import { resolve, parse } from "path"

function isRootPath(path: string): boolean {
  return resolve(path) === parse(path).root
}

function resolveMemoryRoot(worktree: string, directory: string): string {
  if (isRootPath(worktree) && !isRootPath(directory)) return directory
  return worktree
}

// The injected memory prompt is built once per session and reused on every
// turn, so the system prompt prefix stays byte-identical across turns.
// This preserves harness + provider prefix caching instead of invalidating it
// on each message (the failure mode of per-turn recall injection).
const injectedPromptBySession = new Map<string, string>()

export const MemoryPlugin: Plugin = async ({ worktree, directory }) => {
  directory ??= worktree
  const memoryRoot = resolveMemoryRoot(worktree, directory)
  getMemoryDir(memoryRoot)

  return {
    "experimental.chat.system.transform": async (input, output) => {
      const sessionID = input?.sessionID
      if (!sessionID) return

      let memoryPrompt = injectedPromptBySession.get(sessionID)
      if (memoryPrompt === undefined) {
        memoryPrompt = buildMemorySystemPrompt(memoryRoot)
        injectedPromptBySession.set(sessionID, memoryPrompt)
      }
      output.system.push(memoryPrompt)
    },

    tool: {
      memory_save: tool({
        description:
          "Save or update a memory for future conversations. " +
          "Each memory is stored as a markdown file with frontmatter. " +
          "Use this when the user explicitly asks you to remember something, " +
          "or when you observe important information worth preserving across sessions " +
          "(user preferences, feedback, project context, external references). " +
          "Check existing memories first with memory_list or memory_search to avoid duplicates.",
        args: {
          file_name: tool.schema
            .string()
            .describe(
              'File name for the memory (without .md extension). Use snake_case, e.g. "user_role", "feedback_testing_style", "project_auth_rewrite"',
            ),
          name: tool.schema.string().describe("Human-readable name for this memory"),
          description: tool.schema
            .string()
            .describe("One-line description — used to decide relevance in future conversations, so be specific"),
          type: tool.schema
            .enum(MEMORY_TYPES)
            .describe(
              "Memory type: user (about the person), feedback (guidance on approach), project (ongoing work context), reference (pointers to external systems)",
            ),
          content: tool.schema
            .string()
            .describe(
              "Memory content. For feedback/project types, structure as: rule/fact, then **Why:** and **How to apply:** lines",
            ),
        },
        async execute(args) {
          const filePath = saveMemory(memoryRoot, args.file_name, args.name, args.description, args.type, args.content)
          return `Memory saved to ${filePath}`
        },
      }),

      memory_delete: tool({
        description:
          "Delete a memory that is outdated, wrong, or no longer relevant. Also removes it from the index.",
        args: {
          file_name: tool.schema.string().describe("File name of the memory to delete (with or without .md extension)"),
        },
        async execute(args) {
          const deleted = deleteMemory(memoryRoot, args.file_name)
          return deleted ? `Memory "${args.file_name}" deleted.` : `Memory "${args.file_name}" not found.`
        },
      }),

      memory_list: tool({
        description:
          "List all saved memories with their names, types, and descriptions. " +
          "Use this to check what memories exist before saving a new one (to avoid duplicates) " +
          "or when you need to recall what's been stored.",
        args: {},
        async execute() {
          const entries = listMemories(memoryRoot)
          if (entries.length === 0) return "No memories saved yet."
          const lines = entries.map(
            (e) => `- **${e.name}** (${e.type}) [${e.fileName}]: ${e.description}`,
          )
          return `${entries.length} memories found:\n${lines.join("\n")}`
        },
      }),

      memory_search: tool({
        description:
          "Search memories by keyword. Searches across names, descriptions, and content. " +
          "Use this to find relevant memories before answering questions or when the user references past conversations.",
        args: {
          query: tool.schema.string().describe("Search query — searches across name, description, and content"),
        },
        async execute(args) {
          const results = searchMemories(memoryRoot, args.query, 8)
          if (results.length === 0) return `No memories matching "${args.query}".`
          const lines = results.map(
            (e) =>
              `- **${e.name}** (${e.type}) [${e.fileName}]: ${e.description}\n  Content: ${e.content.slice(0, 250)}${e.content.length > 250 ? "..." : ""}`,
          )
          const formatted = `${results.length} matches for "${args.query}":\n${lines.join("\n")}`
          return formatted.length > 6000
            ? formatted.slice(0, 6000) + "\n\n*(results truncated to 6 KB)*"
            : formatted
        },
      }),

      memory_read: tool({
        description:
          "Read the full content of a specific memory file. " +
          "Use this to get the complete details of a memory found via memory_list or memory_search.",
        args: {
          file_name: tool.schema.string().describe("File name of the memory to read (with or without .md extension)"),
        },
        async execute(args) {
          const entry = readMemory(memoryRoot, args.file_name)
          if (!entry) return `Memory "${args.file_name}" not found.`
          return `# ${entry.name} (${entry.type})\n${entry.description}\n\n${entry.content}`
        },
      }),
    },
  }
}

export type { MemoryType }
