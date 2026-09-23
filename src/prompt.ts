import { MEMORY_TYPES, readIndex, truncateEntrypoint, getActiveRulesInline } from "./memory.js"
import { getMemoryDir, ENTRYPOINT_NAME } from "./paths.js"

const FRONTMATTER_EXAMPLE = [
  "```markdown",
  "---",
  "name: {{memory name}}",
  "description: {{one-line description used for relevance}}",
  `type: {{${MEMORY_TYPES.join(" | ")}}}`,
  "---",
  "",
  "{{memory content — for feedback/project: rule/fact, then **Why:** and **How to apply:**}}",
  "```",
].join("\n")

const TYPES_SUMMARY = [
  "## Memory Types",
  "- `user`: User profile, role, responsibilities, specific skills, and communication style.",
  "- `feedback`: Hard rules, preferences, approved workflows, corrections, or tools to avoid/prefer.",
  "- `project`: Non-obvious project goals, architecture decisions, and operational context.",
  "- `reference`: External system pointers (dashboards, issue trackers, remote hosts).",
].join("\n")

const WHAT_NOT_TO_SAVE = [
  "## What NOT to save",
  "- Code patterns, conventions, file paths, or architectures derivable from reading files.",
  "- Git history, recent changes, or commit author info (`git log` is authoritative).",
  "- Ephemeral session state, temporary bugs, or in-progress tasks.",
].join("\n")

export function buildMemorySystemPrompt(worktree: string): string {
  const memoryDir = getMemoryDir(worktree)
  const indexContent = readIndex(worktree)

  const activeRules = getActiveRulesInline(worktree)

  const lines: string[] = [
    "# Persistent Memory System",
    "",
    `Your persistent memory directory is \`${memoryDir}\`.`,
    "You have dedicated tools to interact with memory: `memory_search`, `memory_read`, `memory_save`, `memory_delete`, `memory_list`.",
    "",
    TYPES_SUMMARY,
    "",
    WHAT_NOT_TO_SAVE,
    "",
    "## How to Save",
    "Use the `memory_save` tool (or create a file with frontmatter and register it in MEMORY.md):",
    FRONTMATTER_EXAMPLE,
    "",
    "## Searching Memory",
    "- Use `memory_search(query: \"...\")` to search across all memory files by keyword in names, descriptions, and content.",
    "- Use `memory_read(file_name: \"...\")` to read full topic files when an index entry is relevant.",
  ]

  if (activeRules.trim()) {
    lines.push(
      "",
      "## Active User Rules & Preferences (Inlined)",
      "The following rules and user preferences are loaded and MUST govern your behavior immediately without needing tool calls:",
      "",
      activeRules,
    )
  }

  if (indexContent.trim()) {
    const { content: truncated } = truncateEntrypoint(indexContent)
    lines.push("", `## ${ENTRYPOINT_NAME} (Topic Index)`, "", truncated)
  } else {
    lines.push(
      "",
      `## ${ENTRYPOINT_NAME} (Topic Index)`,
      "",
      `Your ${ENTRYPOINT_NAME} is currently empty. When you save new memories, they will appear here.`,
    )
  }

  return lines.join("\n")
}
