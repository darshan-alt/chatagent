import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { performWebSearch } from "./search";

const ORIGINAL_KEY = process.env.BRAVE_SEARCH_API_KEY;

describe("performWebSearch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.BRAVE_SEARCH_API_KEY;
    else process.env.BRAVE_SEARCH_API_KEY = ORIGINAL_KEY;
  });

  it("returns mock results (no crash) when no API key is set", async () => {
    delete process.env.BRAVE_SEARCH_API_KEY;
    const result = await performWebSearch("california fires");
    expect(result).toContain("Web Search Mock Results");
    expect(result).toContain("california fires");
  });

  it("formats real Brave results when the API returns hits", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({
        web: { results: [{ title: "T1", url: "https://a.test", description: "D1" }] },
      }),
    })));

    const result = await performWebSearch("query");
    expect(result).toContain("Title: T1");
    expect(result).toContain("https://a.test");
    expect(result).toContain("D1");
  });

  it("reports 'no results' when Brave returns an empty list", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ web: { results: [] } }),
    })));

    const result = await performWebSearch("nothing");
    expect(result).toContain("No web search results found");
  });

  it("returns an error string (does not throw) on a non-OK response", async () => {
    process.env.BRAVE_SEARCH_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, statusText: "Forbidden" })));

    const result = await performWebSearch("boom");
    expect(result).toContain("Failed to execute web search");
  });
});
