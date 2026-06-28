import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  type UserMessage,
  type AssistantMessage,
  type ToolResultMessage,
  isTextBlock,
  isToolUseBlock,
  extractText,
  extractToolUses,
} from '../../src/types/message.js'

describe('Message Types', () => {
  it('should create UserMessage', () => {
    const msg: UserMessage = { type: 'user', content: 'hello' }
    expect(msg.type).toBe('user')
    expect(msg.content).toBe('hello')
  })

  it('should create AssistantMessage with text blocks', () => {
    const msg: AssistantMessage = {
      type: 'assistant',
      content: [
        { type: 'text', text: 'Hello! ' },
        { type: 'text', text: 'How can I help?' },
      ],
    }
    expect(msg.type).toBe('assistant')
    expect(extractText(msg)).toBe('Hello! How can I help?')
  })

  it('should create AssistantMessage with tool use blocks', () => {
    const msg: AssistantMessage = {
      type: 'assistant',
      content: [
        { type: 'text', text: 'Let me read that file.' },
        { type: 'tool_use', id: 'tu_1', name: 'read_file', input: { path: '/test.ts' } },
      ],
      stopReason: 'tool_use',
    }
    const toolUses = extractToolUses(msg)
    expect(toolUses).toHaveLength(1)
    expect(toolUses[0].name).toBe('read_file')
    expect(toolUses[0].input).toEqual({ path: '/test.ts' })
  })

  it('should detect block types correctly', () => {
    expect(isTextBlock({ type: 'text', text: 'hi' })).toBe(true)
    expect(isToolUseBlock({ type: 'tool_use', id: '1', name: 'test', input: {} })).toBe(true)
    expect(isTextBlock({ type: 'tool_use', id: '1', name: 'test', input: {} })).toBe(false)
  })

  it('should create ToolResultMessage', () => {
    const msg: ToolResultMessage = {
      type: 'tool_result',
      toolUseId: 'tu_1',
      content: 'File contents here',
    }
    expect(msg.type).toBe('tool_result')
    expect(msg.isError).toBeUndefined()
  })
})
