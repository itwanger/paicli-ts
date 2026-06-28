/**
 * Glob 文件搜索工具
 */
import { z } from 'zod'
import fg from 'fast-glob'
import { buildTool } from '../Tool.js'
import { resolveToolPath } from './guards.js'

export const GlobTool = buildTool({
  name: 'glob',
  description: 'Find files matching a glob pattern. Returns matching file paths.',
  inputSchema: z.object({
    pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.json")'),
    path: z.string().optional().describe('Base directory (default: project root)'),
    limit: z.number().optional().describe('Max results (default: 100)'),
  }),
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    const limit = input.limit ?? 100

    try {
      const basePath = resolveToolPath(context, input.path ?? '.')
      const matches = await fg(input.pattern, {
        cwd: basePath,
        dot: true,
        onlyFiles: false,
        unique: true,
        followSymbolicLinks: false,
        suppressErrors: true,
      })
      const limitedMatches = matches.slice(0, limit)

      if (limitedMatches.length === 0) {
        return { content: 'No files matched the pattern.', displaySummary: `Glob: no matches for ${input.pattern}` }
      }

      return {
        content: `Found ${limitedMatches.length} file(s):\n${limitedMatches.join('\n')}`,
        displaySummary: `Glob: ${limitedMatches.length} matches for ${input.pattern}`,
      }
    } catch (err) {
      return {
        content: `Glob error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
})
