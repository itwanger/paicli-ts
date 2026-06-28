/**
 * 读取文件工具
 */
import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { buildTool } from '../Tool.js'
import { resolveToolPath } from './guards.js'

export const ReadFileTool = buildTool({
  name: 'read_file',
  description: 'Read the contents of a file. Supports text and returns text content with line numbers.',
  inputSchema: z.object({
    path: z.string().describe('File path (relative to project root or absolute)'),
    startLine: z.number().optional().describe('Start line number (1-based, inclusive)'),
    endLine: z.number().optional().describe('End line number (1-based, inclusive)'),
  }),
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    try {
      const filePath = resolveToolPath(context, input.path)
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split('\n')

      let start = (input.startLine ?? 1) - 1
      let end = input.endLine ?? lines.length
      start = Math.max(0, start)
      end = Math.min(lines.length, end)

      const selectedLines = lines.slice(start, end)
      const numbered = selectedLines
        .map((line, i) => `${String(start + i + 1).padStart(4)} | ${line}`)
        .join('\n')

      const totalLines = lines.length
      const showing = `[${start + 1}-${end} of ${totalLines} lines]`

      return {
        content: `${showing}\n${numbered}`,
        displaySummary: `Read ${input.path} (${end - start} lines)`,
      }
    } catch (err) {
      return {
        content: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
})
