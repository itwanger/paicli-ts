/**
 * 列出目录工具
 */
import { z } from 'zod'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { buildTool } from '../Tool.js'
import { resolveToolPath } from './guards.js'

export const ListDirTool = buildTool({
  name: 'list_dir',
  description: 'List files and directories in a given path with type indicators (file/dir).',
  inputSchema: z.object({
    path: z.string().optional().describe('Directory path (default: project root)'),
    depth: z.number().optional().describe('Max recursion depth (default: 1)'),
  }),
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    const maxDepth = input.depth ?? 1

    try {
      const dirPath = resolveToolPath(context, input.path ?? '.')
      const entries = await listEntries(dirPath, context.cwd, 0, maxDepth)
      return { content: entries.join('\n') || '(empty directory)', displaySummary: `Listed ${input.path ?? '.'}` }
    } catch (err) {
      return { content: `Error listing directory: ${err instanceof Error ? err.message : String(err)}`, isError: true }
    }
  },
})

async function listEntries(dir: string, cwd: string, currentDepth: number, maxDepth: number): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const result: string[] = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = join(dir, entry.name)
    const indent = '  '.repeat(currentDepth)

    if (entry.isDirectory()) {
      result.push(`${indent}${entry.name}/`)
      if (currentDepth < maxDepth - 1) {
        const children = await listEntries(fullPath, cwd, currentDepth + 1, maxDepth)
        result.push(...children)
      }
    } else {
      result.push(`${indent}${entry.name}`)
    }
  }

  return result
}
