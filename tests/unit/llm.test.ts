import { describe, it, expect } from 'vitest'
import { createLlmClient, getSupportedProviders } from '../../src/llm/index.js'
import { DeepSeekClient } from '../../src/llm/providers/DeepSeekClient.js'
import { GLMClient } from '../../src/llm/providers/GLMClient.js'
import { OpenAICompatibleClient } from '../../src/llm/providers/OpenAICompatibleClient.js'
import type { LlmConfig } from '../../src/types/config.js'

function makeConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    provider: 'deepseek',
    model: 'deepseek-chat',
    apiKey: 'test-key',
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 60000,
    ...overrides,
  }
}

describe('LlmClientFactory', () => {
  it('should create DeepSeek client', () => {
    const client = createLlmClient(makeConfig({ provider: 'deepseek' }))
    expect(client).toBeInstanceOf(DeepSeekClient)
    expect(client.providerName).toBe('deepseek')
    expect(client.modelName).toBe('deepseek-chat')
    expect(client.capabilities.tools).toBe(true)
  })

  it('should create GLM client', () => {
    const client = createLlmClient(makeConfig({ provider: 'glm', model: 'glm-4' }))
    expect(client).toBeInstanceOf(GLMClient)
    expect(client.providerName).toBe('glm')
    expect(client.maxContextWindow).toBe(128_000)
  })

  it('should create OpenAI compatible client for unknown provider', () => {
    const client = createLlmClient(makeConfig({
      provider: 'custom',
      baseUrl: 'https://custom.api.com/v1',
    }))
    expect(client).toBeInstanceOf(OpenAICompatibleClient)
    expect(client.providerName).toBe('custom')
  })

  it('should list supported providers', () => {
    const providers = getSupportedProviders()
    expect(providers).toContain('deepseek')
    expect(providers).toContain('glm')
    expect(providers).toContain('openai')
  })

  it('should set correct context window for known models', () => {
    const deepseekCoder = createLlmClient(makeConfig({ model: 'deepseek-coder' }))
    expect(deepseekCoder.maxContextWindow).toBe(128_000)

    const glmFlash = createLlmClient(makeConfig({ provider: 'glm', model: 'glm-4-flash' }))
    expect(glmFlash.maxContextWindow).toBe(128_000)
  })
})
