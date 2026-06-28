import { describe, expect, it, vi } from 'vitest'
import { commandRegistry, type ModelStatus } from '../../src/commands/index.js'
import { InlineRenderer } from '../../src/render/InlineRenderer.js'
import { createLlmClient } from '../../src/llm/index.js'

function modelStatus(model: string): ModelStatus {
  return {
    provider: 'deepseek',
    model,
    contextWindow: model === 'deepseek-v4-pro' ? 1_000_000 : 64_000,
    compressionThreshold: 0.96,
    shortTermMemoryBudget: 450_000,
    mcpResourceIndex: true,
    promptCache: 'automatic-prefix-cache',
    conversationTurns: 2,
  }
}

describe('slash commands and terminal UI', () => {
  it('switches model through /model and reports context strategy', async () => {
    let current = modelStatus('deepseek-chat')

    const output = await commandRegistry.execute('/model deepseek-v4-pro', {
      cwd: process.cwd(),
      config: { provider: 'deepseek', model: 'deepseek-chat' },
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
    expect(output).toContain('对话上下文已保留: 2 turns')
  })

  it('shows current model through /status', async () => {
    const output = await commandRegistry.execute('/status', {
      cwd: process.cwd(),
      config: { provider: 'deepseek', model: 'deepseek-chat' },
      getModelStatus() {
        return modelStatus('deepseek-chat')
      },
    })

    expect(output).toContain('当前模型: deepseek-chat (deepseek)')
    expect(output).toContain('上下文策略')
  })

  it('uses the Java-like welcome and status bar details', () => {
    const renderer = new InlineRenderer()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

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

    const output = logSpy.mock.calls.map((call) => call.join(' ')).join('\n')
    logSpy.mockRestore()

    expect(output).toContain('PaiCLI')
    expect(output).toContain('deepseek-v4-pro (deepseek)')
    expect(output).toMatch(/MCP.*5\/5/)
    expect(output).toContain('ctx')
    expect(output).toContain('turns 3')
  })

  it('uses one million context window for deepseek-v4-pro', () => {
    const client = createLlmClient({
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      apiKey: 'test',
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 60_000,
    })

    expect(client.maxContextWindow).toBe(1_000_000)
  })
})
