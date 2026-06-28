/**
 * 写入文件工具
 */
import { z } from 'zod'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { buildTool } from '../Tool.js'
import { resolveToolPath } from './guards.js'

export const WriteFileTool = buildTool({
  name: 'write_file',
  description: 'Write content to a file. Creates parent directories if needed. Overwrites existing files.',
  inputSchema: z.object({
    path: z.string().describe('File path (relative to project root or absolute)'),
    content: z.string().describe('File content to write'),
  }),
  isReadOnly: false,
  isConcurrencySafe: false,
  dangerLevel: 'medium',
  async call(input, context) {
    try {
      const filePath = resolveToolPath(context, input.path)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, input.content, 'utf-8')
      const lines = input.content.split('\n').length
      return {
        content: `Successfully wrote ${lines} lines to ${input.path}`,
        displaySummary: `Wrote ${input.path} (${lines} lines)`,
      }
    } catch (err) {
      return {
        content: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    }
  },
})
