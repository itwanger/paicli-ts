/**
 * 智谱 GLM LLM 客户端
 * 支持 GLM-4 系列模型
 */

import { OpenAICompatibleClient, type OpenAICompatibleConfig } from './OpenAICompatibleClient.js'

const GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'

/** GLM 模型配置 */
export const GLM_MODELS: Record<string, { maxContext: number }> = {
  'glm-4': { maxContext: 128_000 },
  'glm-4-flash': { maxContext: 128_000 },
  'glm-4-plus': { maxContext: 128_000 },
  'glm-4v': { maxContext: 8_000 },
}

/**
 * 智谱 GLM 客户端
 * 基于 OpenAI 兼容 API
 */
export class GLMClient extends OpenAICompatibleClient {
  constructor(config: Omit<OpenAICompatibleConfig, 'providerName' | 'baseUrl'> & { baseUrl?: string }) {
    const modelConfig = GLM_MODELS[config.model] ?? { maxContext: 128_000 }
    super({
      ...config,
      providerName: 'glm',
      baseUrl: config.baseUrl ?? GLM_BASE_URL,
      maxContextWindow: modelConfig.maxContext,
    })
  }
}
