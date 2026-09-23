import { afterEach, describe, expect, it, setSystemTime } from "bun:test"
import { createPromptCache } from "../src/prompt-cache.ts"

afterEach(() => setSystemTime())

describe("createPromptCache", () => {
  it("builds once per session and reuses the same text", () => {
    const cache = createPromptCache()
    let builds = 0
    const build = () => `prompt ${++builds}`
    expect(cache.get("a", build)).toBe("prompt 1")
    expect(cache.get("a", build)).toBe("prompt 1")
    expect(builds).toBe(1)
  })

  it("evicts the least recently used session past the cap", () => {
    const cache = createPromptCache({ maxSessions: 2 })
    cache.get("a", () => "a1")
    cache.get("b", () => "b1")
    cache.get("a", () => "a2") // a is now the most recent
    cache.get("c", () => "c1")
    expect(cache.size()).toBe(2)
    expect(cache.get("a", () => "a3")).toBe("a1")
    expect(cache.get("b", () => "b2")).toBe("b2") // b was evicted, rebuilt
  })

  it("rebuilds a session idle for longer than the limit and drops idle ones", () => {
    const cache = createPromptCache({ idleMs: 1000 })
    setSystemTime(new Date(1_000_000))
    cache.get("a", () => "a1")
    cache.get("b", () => "b1")
    setSystemTime(new Date(1_001_500))
    expect(cache.get("a", () => "a2")).toBe("a2")
    expect(cache.size()).toBe(1)
  })
})
