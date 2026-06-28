import { describe, expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { commandRegistry, type ModelStatus } from '../../src/commands/index.js'
import { applyPromptInput, InlineRenderer } from '../../src/render/InlineRenderer.js'
import { createLlmClient } from '../../src/llm/index.js'
import { LineReader } from '../../src/render/LineReader.js'
import { parseInlineMarkdown, parseMarkdownBlocks } from '../../src/render/MarkdownText.js'

function modelStatus(model: string): ModelStatus {
  return {
    provider: 'deepseek',
    model,
    contextWindow: 1_000_000,
    compressionThreshold: 0.48,
    shortTermMemoryBudget: 600_000,
    mcpResourceIndex: false,
    promptCache: 'deepseek-disk-cache',
    conversationTurns: 2,
  }
}

describe('slash commands and terminal UI', () => {
  it('switches model through /model and reports context strategy', async () => {
    let current = modelStatus('deepseek-v4-flash')

    const output = await commandRegistry.execute('/model deepseek-v4-pro', {
      cwd: process.cwd(),
      config: { provider: 'deepseek', model: 'deepseek-v4-flash' },
      setModel(model, provider) {
        current = { ...modelStatus(model), provider: provider ?? 'deepseek' }
        return current
      },
      getModelStatus() {
        return current
      },
    })

    expect(output).toContain('已切换到: deepseek-v4-pro (deepseek)')
    expect(output).toContain('window: 1000000')
    expect(output).toContain('压缩阈值: 48% (480000 tokens)')
    expect(output).toContain('prompt cache: deepseek-disk-cache')
    expect(output).toContain('对话上下文已保留: 2 turns')
  })

  it('shows current model through /status', async () => {
    const output = await commandRegistry.execute('/status', {
      cwd: process.cwd(),
      config: { provider: 'deepseek', model: 'deepseek-v4-flash' },
      getModelStatus() {
        return modelStatus('deepseek-v4-flash')
      },
    })

    expect(output).toContain('当前模型: deepseek-v4-flash (deepseek)')
    expect(output).toContain('上下文策略')
  })

  it('uses the Java-like welcome and status bar details', () => {
    const renderer = new InlineRenderer()
    const writes: string[] = []
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString())
      return true
    })

    renderer.showStatus({
      model: 'deepseek-v4-pro',
      provider: 'deepseek',
      tokensUsed: 12_700,
      tokenLimit: 1_000_000,
      agentMode: 'ReAct',
      statusText: 'idle',
      cwd: '/Users/example/Documents/GitHub/paicli-ts',
      toolCount: 9,
      mcpServers: 5,
      connectedMcpServers: 5,
      skills: 5,
      loadedSkills: 5,
      hitlMode: 'auto',
      memoryEnabled: true,
      conversationTurns: 3,
    })
    renderer.showWelcome('0.1.0')
    renderer.showPrompt()

    const output = writes.join('')
    writeSpy.mockRestore()

    expect(output).toContain('PaiCLI')
    expect(output).toContain('deepseek-v4-pro (deepseek)')
    expect(output).toContain('██  ██')
    expect(output).not.toContain('╚═██╔═╝')
    expect(output).toMatch(/MCP.*5\/5/)
    expect(output).toContain('ctx')
    expect(output).toContain('turns 3')
  })

  it('uses official DeepSeek V4 context window', () => {
    const client = createLlmClient({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      apiKey: 'test',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60_000,
    })

    expect(client.maxContextWindow).toBe(1_000_000)
    expect(client.capabilities.promptCache).toBe(true)
  })

  it('keeps piped fallback input across multiple REPL reads', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const prompts: Buffer[] = []
    output.on('data', (chunk: Buffer) => prompts.push(chunk))
    const reader = new LineReader(input, output, false)

    input.end('/status\n/model deepseek-v4-pro\n/exit\n')

    try {
      await expect(reader.read('> ')).resolves.toBe('/status')
      await expect(reader.read('> ')).resolves.toBe('/model deepseek-v4-pro')
      await expect(reader.read('> ')).resolves.toBe('/exit')
      expect(Buffer.concat(prompts).toString()).toBe('> > > ')
    } finally {
      reader.close()
    }
  })

  it('parses markdown into terminal renderable blocks', () => {
    const blocks = parseMarkdownBlocks('## 标题\n\n1. **重点** 和 `code`\n> 引用\n```ts\nconst x = 1\n```')

    expect(blocks).toMatchObject([
      { type: 'heading', level: 2, text: '标题' },
      { type: 'blank' },
      { type: 'list', marker: '1.', text: '**重点** 和 `code`' },
      { type: 'quote', text: '引用' },
      { type: 'code', language: 'ts', lines: ['const x = 1'] },
    ])
    expect(parseInlineMarkdown('**重点** 和 `code` [link](https://example.com)')).toMatchObject([
      { type: 'bold', text: '重点' },
      { type: 'text', text: ' 和 ' },
      { type: 'code', text: 'code' },
      { type: 'text', text: ' ' },
      { type: 'link', label: 'link', url: 'https://example.com' },
    ])
  })

  it('does not drop IME text when it arrives with return', () => {
    expect(applyPromptInput('', '你好\r', { return: true })).toEqual({ value: '', submit: '你好' })
    expect(applyPromptInput('联', '网查一下\n', { return: true })).toEqual({ value: '', submit: '联网查一下' })
  })

  it('handles raw terminal backspace characters', () => {
    expect(applyPromptInput('/xit', '\u007f', {})).toEqual({ value: '/xi' })
    expect(applyPromptInput('你好', '\b', {})).toEqual({ value: '你' })
  })
})
