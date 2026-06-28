/**
 * DeepSeek LLM 客户端
 * 支持 DeepSeek V3/V4 系列模型
 */

import { OpenAICompatibleClient, type OpenAICompatibleConfig } from './OpenAICompatibleClient.js'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

/** DeepSeek 模型配置 */
export const DEEPSEEK_MODELS: Record<string, { maxContext: number }> = {
  'deepseek-chat': { maxContext: 64_000 },
  'deepseek-reasoner': { maxContext: 64_000 },
  'deepseek-coder': { maxContext: 128_000 },
}

/**
 * DeepSeek 客户端
 * 基于 OpenAI 兼容 API
 */
export class DeepSeekClient extends OpenAICompatibleClient {
  constructor(config: Omit<OpenAICompatibleConfig, 'providerName' | 'baseUrl'> & { baseUrl?: string }) {
    const modelConfig = DEEPSEEK_MODELS[config.model] ?? { maxContext: 64_000 }
    super({
      ...config,
      providerName: 'deepseek',
      baseUrl: config.baseUrl ?? DEEPSEEK_BASE_URL,
      maxContextWindow: modelConfig.maxContext,
    })
  }
}
