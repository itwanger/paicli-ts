/**
 * 网页搜索工具（占位实现 — 将在后续集成搜索 API）
 */
import { z } from 'zod'
import { buildTool } from '../Tool.js'

export const WebSearchTool = buildTool({
  name: 'web_search',
  description: 'Search the web for information. Returns search results with titles and snippets.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    maxResults: z.number().optional().describe('Max results (default: 5)'),
  }),
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input) {
    const maxResults = input.maxResults ?? 5
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(input.query)}`

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'PaiCLI/0.1.0' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) {
        return { content: `Search HTTP ${response.status}: ${response.statusText}`, isError: true }
      }

      const html = await response.text()
      const results = parseDuckDuckGoResults(html).slice(0, maxResults)
      if (results.length === 0) {
        return { content: `No search results found for "${input.query}".`, displaySummary: `Search: no results` }
      }

      return {
        content: results
          .map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`)
          .join('\n\n'),
        displaySummary: `Search: ${results.length} results for ${input.query}`,
      }
    } catch (err) {
      return {
        content: `Search error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
})

interface SearchResult {
  title: string
  url: string
  snippet: string
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = []
  const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
  let match: RegExpExecArray | null
  while ((match = resultRegex.exec(html)) !== null) {
    results.push({
      title: decodeHtml(stripTags(match[2] ?? '')),
      url: normalizeDuckDuckGoUrl(decodeHtml(match[1] ?? '')),
      snippet: decodeHtml(stripTags(match[3] ?? '')),
    })
  }
  return results
}

function normalizeDuckDuckGoUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://duckduckgo.com')
    const uddg = parsed.searchParams.get('uddg')
    return uddg ? decodeURIComponent(uddg) : parsed.toString()
  } catch {
    return url
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeHtml(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
}
