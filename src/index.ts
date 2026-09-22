import { Plugin } from "@opencode/plugin"
import { Schema } from "effect"
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

const FileName = Schema.String.annotate({
  description: "File name of the memory (with or without .md extension)",
})

export default Plugin.define({
  id: "claude-memory",
  setup: async (ctx) => {
    // V1 received worktree and directory as arguments; V2 carries both on the
    // active Location, where `project.directory` is the repository root.
    const memoryRoot = resolveMemoryRoot(ctx.location.project.directory, ctx.location.directory)
    getMemoryDir(memoryRoot)

    await ctx.session.hook("context", (event) => {
      let memoryPrompt = injectedPromptBySession.get(event.sessionID)
      if (memoryPrompt === undefined) {
        memoryPrompt = buildMemorySystemPrompt(memoryRoot)
        injectedPromptBySession.set(event.sessionID, memoryPrompt)
      }
      event.system.push({ type: "text", text: memoryPrompt })
    })

    await ctx.tool.transform((tools) => {
      tools.add({
        name: "memory_save",
        options: { codemode: false },
        description:
          "Save or update a memory for future conversations. " +
          "Each memory is stored as a markdown file with frontmatter. " +
          "Use this when the user explicitly asks you to remember something, " +
          "or when you observe important information worth preserving across sessions " +
          "(user preferences, feedback, project context, external references). " +
          "Check existing memories first with memory_list or memory_search to avoid duplicates.",
        input: Schema.Struct({
          file_name: Schema.String.annotate({
            description:
              'File name for the memory (without .md extension). Use snake_case, e.g. "user_role", "feedback_testing_style", "project_auth_rewrite"',
          }),
          name: Schema.String.annotate({ description: "Human-readable name for this memory" }),
          description: Schema.String.annotate({
            description:
              "One-line description — used to decide relevance in future conversations, so be specific",
          }),
          type: Schema.Literals(MEMORY_TYPES).annotate({
            description:
              "Memory type: user (about the person), feedback (guidance on approach), project (ongoing work context), reference (pointers to external systems)",
          }),
          content: Schema.String.annotate({
            description:
              "Memory content. For feedback/project types, structure as: rule/fact, then **Why:** and **How to apply:** lines",
          }),
        }),
        execute: async (input) => {
          const filePath = saveMemory(
            memoryRoot,
            input.file_name,
            input.name,
            input.description,
            input.type as MemoryType,
            input.content,
          )
          return { content: `Memory saved to ${filePath}`, metadata: { path: filePath } }
        },
      })

      tools.add({
        name: "memory_delete",
        options: { codemode: false },
        description:
          "Delete a memory that is outdated, wrong, or no longer relevant. Also removes it from the index.",
        input: Schema.Struct({ file_name: FileName }),
        execute: async (input) => {
          const deleted = deleteMemory(memoryRoot, input.file_name)
          return {
            content: deleted
              ? `Memory "${input.file_name}" deleted.`
              : `Memory "${input.file_name}" not found.`,
          }
        },
      })

      tools.add({
        name: "memory_list",
        options: { codemode: false },
        description:
          "List all saved memories with their names, types, and descriptions. " +
          "Use this to check what memories exist before saving a new one (to avoid duplicates) " +
          "or when you need to recall what's been stored.",
        // Schema.Struct({}) emits { anyOf: [{type:"object"},{type:"array"}] },
        // which has no top-level `type` and Anthropic rejects outright
        // ("input_schema.type: Field required"). A no-argument tool states its
        // JSON Schema directly — Tool.ValueSchema accepts one.
        input: { type: "object", properties: {}, additionalProperties: false },
        execute: async () => {
          const entries = listMemories(memoryRoot)
          if (entries.length === 0) return { content: "No memories saved yet." }
          const lines = entries.map((e) => `- **${e.name}** (${e.type}) [${e.fileName}]: ${e.description}`)
          return {
            content: `${entries.length} memories found:\n${lines.join("\n")}`,
            metadata: { count: entries.length },
          }
        },
      })

      tools.add({
        name: "memory_search",
        options: { codemode: false },
        description:
          "Search memories by keyword. Searches across names, descriptions, and content. " +
          "Use this to find relevant memories before answering questions or when the user references past conversations.",
        input: Schema.Struct({
          query: Schema.String.annotate({
            description: "Search query — searches across name, description, and content",
          }),
        }),
        execute: async (input) => {
          const results = searchMemories(memoryRoot, input.query, 8)
          if (results.length === 0) return { content: `No memories matching "${input.query}".` }
          const lines = results.map(
            (e) =>
              `- **${e.name}** (${e.type}) [${e.fileName}]: ${e.description}\n  Content: ${e.content.slice(0, 250)}${e.content.length > 250 ? "..." : ""}`,
          )
          const formatted = `${results.length} matches for "${input.query}":\n${lines.join("\n")}`
          return {
            content:
              formatted.length > 6000
                ? formatted.slice(0, 6000) + "\n\n*(results truncated to 6 KB)*"
                : formatted,
            metadata: { count: results.length },
          }
        },
      })

      tools.add({
        name: "memory_read",
        options: { codemode: false },
        description:
          "Read the full content of a specific memory file. " +
          "Use this to get the complete details of a memory found via memory_list or memory_search.",
        input: Schema.Struct({ file_name: FileName }),
        execute: async (input) => {
          const entry = readMemory(memoryRoot, input.file_name)
          if (!entry) return { content: `Memory "${input.file_name}" not found.` }
          return { content: `# ${entry.name} (${entry.type})\n${entry.description}\n\n${entry.content}` }
        },
      })
    })
  },
})

export type { MemoryType }
