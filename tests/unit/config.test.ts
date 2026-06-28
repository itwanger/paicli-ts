import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, DEFAULT_CONFIG } from '../../src/config/index.js'

describe('Config', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 清除测试环境变量
    delete process.env.PAICLI_API_KEY
    delete process.env.PAICLI_PROVIDER
    delete process.env.PAICLI_MODEL
    delete process.env.PAICLI_BASE_URL
    delete process.env.PAICLI_RENDER_MODE
    delete process.env.PAICLI_HITL
    delete process.env.PAICLI_MCP
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('should return default config when no overrides', () => {
    const config = loadConfig()
    expect(config.llm.provider).toBe('deepseek')
    expect(config.llm.model).toBe('deepseek-v4-flash')
    expect(config.renderMode).toBe('inline')
    expect(config.features.mcp).toBe(true)
  })

  it('should apply overrides', () => {
    const config = loadConfig({
      overrides: {
        llm: {
          ...DEFAULT_CONFIG.llm,
          provider: 'openai',
          model: 'gpt-4',
        },
      },
    })
    expect(config.llm.provider).toBe('openai')
    expect(config.llm.model).toBe('gpt-4')
    // 其他字段保持默认
    expect(config.llm.maxTokens).toBe(8192)
  })

  it('should apply environment variable overrides', () => {
    process.env.PAICLI_API_KEY = 'test-key-123'
    process.env.PAICLI_PROVIDER = 'glm'
    process.env.PAICLI_MODEL = 'glm-4'
    process.env.PAICLI_RENDER_MODE = 'plain'
    process.env.PAICLI_HITL = 'never'

    const config = loadConfig()
    expect(config.llm.apiKey).toBe('test-key-123')
    expect(config.llm.provider).toBe('glm')
    expect(config.llm.model).toBe('glm-4')
    expect(config.renderMode).toBe('plain')
    expect(config.policy.hitlMode).toBe('never')
  })

  it('should disable features via env', () => {
    process.env.PAICLI_MCP = 'false'
    const config = loadConfig()
    expect(config.features.mcp).toBe(false)
  })

  it('should have correct default values', () => {
    const config = loadConfig()
    expect(config.tools.timeout).toBe(60_000)
    expect(config.tools.batchTimeout).toBe(90_000)
    expect(config.tools.maxConcurrentRead).toBe(4)
    expect(config.memory.tokenBudgetMode).toBe('balanced')
    expect(config.policy.pathGuardEnabled).toBe(true)
    expect(config.prompt.agentMode).toBe('react')
  })
})
