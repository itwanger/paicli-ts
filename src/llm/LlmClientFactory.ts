/**
 * LLM 客户端工厂
 * 根据配置创建对应的 LLM 客户端实例
 */

import type { LlmClient } from './types.js'
import type { LlmConfig } from '../types/config.js'
import { DeepSeekClient } from './providers/DeepSeekClient.js'
import { GLMClient } from './providers/GLMClient.js'
import { OpenAICompatibleClient } from './providers/OpenAICompatibleClient.js'

/** 已注册的 Provider */
export type LlmProvider = 'deepseek' | 'glm' | 'openai'

/**
 * 根据配置创建 LLM 客户端
 */
export function createLlmClient(config: LlmConfig): LlmClient {
  const baseConfig = {
    apiKey: config.apiKey,
    model: config.model,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    timeout: config.timeout,
    baseUrl: config.baseUrl ?? '',
  }

  switch (config.provider) {
    case 'deepseek':
      return new DeepSeekClient({
        ...baseConfig,
        baseUrl: config.baseUrl ?? undefined,
      })

    case 'glm':
      return new GLMClient({
        ...baseConfig,
        baseUrl: config.baseUrl ?? undefined,
      })

    case 'openai':
      return new OpenAICompatibleClient({
        ...baseConfig,
        baseUrl: config.baseUrl ?? 'https://api.openai.com/v1',
        providerName: 'openai',
      })

    default:
      // 未知 provider 时使用 OpenAI 兼容层
      return new OpenAICompatibleClient({
        ...baseConfig,
        baseUrl: config.baseUrl ?? '',
        providerName: config.provider,
      })
  }
}

/** 获取支持的 Provider 列表 */
export function getSupportedProviders(): LlmProvider[] {
  return ['deepseek', 'glm', 'openai']
}
