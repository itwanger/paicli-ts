/**
 * Grep 内容搜索工具
 */
import { z } from 'zod'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { buildTool } from '../Tool.js'
import { resolveToolPath } from './guards.js'

export const GrepTool = buildTool({
  name: 'grep',
  description: 'Search file contents using regex patterns. Returns matching lines with file paths and line numbers.',
  inputSchema: z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('Directory to search in (default: project root)'),
    fileGlob: z.string().optional().describe('File extension filter (e.g. ".ts", ".json")'),
    caseInsensitive: z.boolean().optional().describe('Case insensitive search (default: false)'),
    maxResults: z.number().optional().describe('Max results (default: 50)'),
  }),
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    const flags = input.caseInsensitive ? 'i' : ''
    let regex: RegExp
    try {
      regex = new RegExp(input.pattern, flags)
    } catch {
      return { content: `Invalid regex pattern: ${input.pattern}`, isError: true }
    }

    const maxResults = input.maxResults ?? 50
    const results: string[] = []

    try {
      const searchPath = resolveToolPath(context, input.path ?? '.')
      await searchDir(searchPath, context.cwd, regex, input.fileGlob, results, maxResults)

      if (results.length === 0) {
        return { content: `No matches found for pattern: ${input.pattern}`, displaySummary: `Grep: no matches` }
      }

      return {
        content: `Found ${results.length} match(es):\n${results.join('\n')}`,
        displaySummary: `Grep: ${results.length} matches for "${input.pattern}"`,
      }
    } catch (err) {
      return { content: `Grep error: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  },
})

async function searchDir(
  dir: string, cwd: string, pattern: RegExp, ext: string | undefined,
  results: string[], max: number,
): Promise<void> {
  if (results.length >= max) return
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (results.length >= max) return
    const fullPath = join(dir, entry.name)

    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue

    if (entry.isDirectory()) {
      await searchDir(fullPath, cwd, pattern, ext, results, max)
    } else if (entry.isFile()) {
      if (ext && !entry.name.endsWith(ext)) continue
      try {
        const content = await readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length && results.length < max; i++) {
          if (pattern.test(lines[i])) {
            const rel = relative(cwd, fullPath)
            results.push(`${rel}:${i + 1}: ${lines[i].trim()}`)
          }
        }
      } catch { /* skip binary files */ }
    }
  }
}
