/**
 * 保存记忆工具
 */
import { z } from 'zod'
import { buildTool } from '../Tool.js'
import { DEFAULT_CONFIG } from '../../config/defaults.js'
import { LongTermMemory } from '../../memory/LongTermMemory.js'

export const SaveMemoryTool = buildTool({
  name: 'save_memory',
  description: 'Save an important piece of information to long-term memory for future reference.',
  inputSchema: z.object({
    content: z.string().describe('The information to remember'),
    category: z.string().optional().describe('Memory category (e.g. "preference", "fact", "decision")'),
  }),
  isReadOnly: false,
  isConcurrencySafe: true,
  async call(input, context) {
    const memoryConfig = (context.config as { memory?: { longTermDbPath?: string } }).memory
    const dbPath = memoryConfig?.longTermDbPath ?? DEFAULT_CONFIG.memory.longTermDbPath
    const memory = new LongTermMemory(dbPath)
    try {
      const id = memory.save(input.content, input.category ?? 'general')
      return {
        content: `Memory saved with id ${id}: "${input.content.slice(0, 100)}${input.content.length > 100 ? '...' : ''}" (category: ${input.category ?? 'general'})`,
        displaySummary: `Saved memory ${id} (${input.category ?? 'general'})`,
      }
    } catch (err) {
      return {
        content: `Memory save error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      }
    } finally {
      memory.close()
    }
  },
})
