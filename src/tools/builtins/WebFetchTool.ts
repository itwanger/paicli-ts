/**
 * 网页抓取工具
 */
import { z } from 'zod'
import { buildTool } from '../Tool.js'

export const WebFetchTool = buildTool({
  name: 'web_fetch',
  description: 'Fetch the content of a web page. Returns the text content of the page.',
  inputSchema: z.object({
    url: z.string().describe('URL to fetch'),
    maxLength: z.number().optional().describe('Max content length in characters (default: 10000)'),
  }),
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input) {
    const maxLength = input.maxLength ?? 10_000

    try {
      const response = await fetch(input.url, {
        headers: { 'User-Agent': 'PaiCLI/0.1.0' },
        signal: AbortSignal.timeout(15_000),
      })

      if (!response.ok) {
        return { content: `HTTP ${response.status}: ${response.statusText}`, isError: true }
      }

      const contentType = response.headers.get('content-type') ?? ''
      let content = await response.text()

      // 简单 HTML 文本提取
      if (contentType.includes('html')) {
        content = extractTextFromHtml(content)
      }

      if (content.length > maxLength) {
        content = content.slice(0, maxLength) + '\n... [truncated]'
      }

      return {
        content: content || '(empty page)',
        displaySummary: `Fetched ${input.url} (${content.length} chars)`,
      }
    } catch (err) {
      return {
        content: `Fetch error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
})

/** 简易 HTML 文本提取 */
function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}
