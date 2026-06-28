import { describe, it, expect } from 'vitest'
import { ToolRegistry } from '../../src/tools/registry.js'
import { StreamingToolExecutor } from '../../src/tools/executor.js'
import { getBuiltinTools } from '../../src/tools/builtins/index.js'
import type { ToolContext } from '../../src/types/tool.js'

const mockContext: ToolContext = { cwd: '/tmp', config: {} }

describe('ToolRegistry', () => {
  it('should register and retrieve tools', () => {
    const registry = new ToolRegistry()
    const tools = getBuiltinTools()
    registry.registerAll(tools)

    expect(registry.size).toBe(9)
    expect(registry.has('read_file')).toBe(true)
    expect(registry.has('write_file')).toBe(true)
    expect(registry.has('bash')).toBe(true)
  })

  it('should throw on duplicate registration', () => {
    const registry = new ToolRegistry()
    const tools = getBuiltinTools()
    registry.registerAll(tools)
    expect(() => registry.register(tools[0])).toThrow('already registered')
  })

  it('should generate definitions for all tools', () => {
    const registry = new ToolRegistry()
    registry.registerAll(getBuiltinTools())
    const defs = registry.getDefinitions()
    expect(defs.length).toBe(9)
    expect(defs.every((d) => d.name && d.description)).toBe(true)
  })

  it('should filter tools by name', () => {
    const registry = new ToolRegistry()
    registry.registerAll(getBuiltinTools())
    const filtered = registry.filter(['read_file', 'bash'])
    expect(filtered.size).toBe(2)
    expect(filtered.has('read_file')).toBe(true)
  })

  it('should exclude tools by name', () => {
    const registry = new ToolRegistry()
    registry.registerAll(getBuiltinTools())
    const filtered = registry.exclude(['bash', 'write_file'])
    expect(filtered.size).toBe(7)
    expect(filtered.has('bash')).toBe(false)
  })

  it('should get read-only tools', () => {
    const registry = new ToolRegistry()
    registry.registerAll(getBuiltinTools())
    const readOnly = registry.getReadOnlyTools()
    expect(readOnly.every((t) => t.isReadOnly)).toBe(true)
    expect(readOnly.length).toBeGreaterThan(0)
  })
})

describe('StreamingToolExecutor', () => {
  it('should execute read-only tool', async () => {
    const registry = new ToolRegistry()
    registry.registerAll(getBuiltinTools())
    const executor = new StreamingToolExecutor(registry)

    executor.add({ id: 'tu_1', name: 'read_file', input: { path: '/nonexistent' } })
    expect(executor.hasPending()).toBe(true)

    const results = await executor.executeAll(mockContext)
    expect(results).toHaveLength(1)
    expect(results[0].toolUseId).toBe('tu_1')
    expect(results[0].isError).toBe(true) // file doesn't exist
  })

  it('should handle unknown tool gracefully', async () => {
    const registry = new ToolRegistry()
    registry.registerAll(getBuiltinTools())
    const executor = new StreamingToolExecutor(registry)

    executor.add({ id: 'tu_2', name: 'unknown_tool', input: {} })
    const results = await executor.executeAll(mockContext)
    expect(results).toHaveLength(1)
    expect(results[0].isError).toBe(true)
    expect(results[0].content).toContain('not found')
  })

  it('should execute bash tool', async () => {
    const registry = new ToolRegistry()
    registry.registerAll(getBuiltinTools())
    const executor = new StreamingToolExecutor(registry)

    executor.add({ id: 'tu_3', name: 'bash', input: { command: 'echo hello' } })
    const results = await executor.executeAll(mockContext)
    expect(results).toHaveLength(1)
    expect(results[0].content).toContain('hello')
    expect(results[0].isError).toBeUndefined()
  })

  it('should return empty results for no pending requests', async () => {
    const registry = new ToolRegistry()
    const executor = new StreamingToolExecutor(registry)
    const results = await executor.executeAll(mockContext)
    expect(results).toHaveLength(0)
  })
})
