import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { buildTool, ToolValidationError } from '../../src/tools/Tool.js'
import type { ToolContext } from '../../src/types/tool.js'

const mockContext: ToolContext = {
  cwd: '/test',
  config: {},
}

describe('buildTool', () => {
  const testTool = buildTool({
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: z.object({
      message: z.string().describe('A message'),
      count: z.number().optional().describe('A count'),
    }),
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input, _context) {
      return { content: `Got: ${input.message} (count: ${input.count ?? 0})` }
    },
  })

  it('should have correct name and description', () => {
    expect(testTool.name).toBe('test_tool')
    expect(testTool.description).toBe('A test tool')
    expect(testTool.isReadOnly).toBe(true)
    expect(testTool.isConcurrencySafe).toBe(true)
  })

  it('should generate tool definition', () => {
    const def = testTool.getDefinition()
    expect(def.name).toBe('test_tool')
    expect(def.description).toBe('A test tool')
    expect(def.parameters.type).toBe('object')
    expect(def.parameters.properties).toHaveProperty('message')
    expect(def.isReadOnly).toBe(true)
  })

  it('should validate correct input', () => {
    const result = testTool.validate({ message: 'hello', count: 5 })
    expect(result).toEqual({ message: 'hello', count: 5 })
  })

  it('should validate input with optional fields', () => {
    const result = testTool.validate({ message: 'hello' })
    expect(result).toEqual({ message: 'hello' })
  })

  it('should throw on invalid input', () => {
    expect(() => testTool.validate({ count: 5 })).toThrow(ToolValidationError)
  })

  it('should execute and return result', async () => {
    const result = await testTool.execute({ message: 'hi' }, 'tu_1', mockContext)
    expect(result.toolUseId).toBe('tu_1')
    expect(result.content).toBe('Got: hi (count: 0)')
    expect(result.isError).toBeUndefined()
  })

  it('should execute streaming', async () => {
    const chunks = []
    for await (const chunk of testTool.executeStream({ message: 'stream' }, 'tu_2', mockContext)) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Got: stream (count: 0)')
  })

  it('should have safe meta for readonly tools', () => {
    expect(testTool.meta.dangerLevel).toBe('safe')
    expect(testTool.meta.requiresApproval).toBe(false)
  })

  it('should create tool with streaming call', async () => {
    const streamTool = buildTool({
      name: 'stream_tool',
      description: 'A streaming tool',
      inputSchema: z.object({ query: z.string() }),
      isReadOnly: true,
      isConcurrencySafe: false,
      async *call(input) {
        yield { content: 'Part 1: ' }
        yield { content: `Part 2: ${input.query}` }
      },
    })

    const result = await streamTool.execute({ query: 'test' }, 'tu_3', mockContext)
    expect(result.content).toBe('Part 1: Part 2: test')
  })
})
