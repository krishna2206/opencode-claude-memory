// The injected memory prompt is built once per session and reused on every
// turn, so the system prompt prefix stays byte-identical across turns.
// This preserves harness + provider prefix caching instead of invalidating it
// on each message (the failure mode of per-turn recall injection).
//
// Entries are bounded: each can reach ~40 KB and every session, subagents
// included, adds one. Evicting a session only costs a rebuilt prompt on its
// next turn, and after an hour idle the provider's prompt cache (5 min to 1 h)
// has expired anyway.

export interface PromptCacheOptions {
  readonly maxSessions?: number
  readonly idleMs?: number
}

export function createPromptCache(options: PromptCacheOptions = {}) {
  const maxSessions = options.maxSessions ?? 64
  const idleMs = options.idleMs ?? 60 * 60 * 1000
  const entries = new Map<string, { text: string; usedAt: number }>()

  return {
    /** The session's prompt, built on first use or after it went idle. */
    get(sessionID: string, build: () => string): string {
      const now = Date.now()
      const cached = entries.get(sessionID)
      // Re-inserted below, so the Map stays ordered least recently used first.
      entries.delete(sessionID)
      const text = cached && now - cached.usedAt < idleMs ? cached.text : build()
      entries.set(sessionID, { text, usedAt: now })
      for (const [id, entry] of entries) {
        if (entries.size <= maxSessions && now - entry.usedAt < idleMs) break
        entries.delete(id)
      }
      return text
    },
    size: () => entries.size,
  }
}
