export async function performWebSearch(query: string): Promise<string> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!apiKey) {
    console.warn("BRAVE_SEARCH_API_KEY not found in environment. Using fallback web search response.");
    return `[Web Search Mock Results for "${query}"]:
1. California Forest Fire Report 2024: Over 500,000 acres affected. Firefighters making progress in Northern California.
2. Wildfire Activity Summary: High temperatures and wind conditions contributing to fire spread. Emergency services deployed.`;
  }

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!res.ok) {
      throw new Error(`Brave Search API error: ${res.statusText}`);
    }

    const data = await res.json();
    const results = data.web?.results || [];

    if (results.length === 0) {
      return `No web search results found for query: "${query}".`;
    }

    return results
      .map(
        (r: any, idx: number) =>
          `[Result ${idx + 1}] Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.description}`
      )
      .join("\n\n");
  } catch (error: any) {
    console.error("Web Search error:", error);
    return `Failed to execute web search for "${query}". Error: ${error.message}`;
  }
}
