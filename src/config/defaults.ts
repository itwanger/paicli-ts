/**
 * PaiCLI 默认配置
 */

import type { PaiCliConfig } from '../types/config.js'

/** 默认配置 */
export const DEFAULT_CONFIG: PaiCliConfig = {
  llm: {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    apiKey: '',
    maxTokens: 8192,
    temperature: 0.7,
    timeout: 120_000,
  },

  renderMode: 'inline',

  tools: {
    enabled: [],
    disabled: [],
    timeout: 60_000,
    batchTimeout: 90_000,
    maxConcurrentRead: 4,
  },

  mcp: {
    servers: [],
    autoStart: true,
  },

  memory: {
    maxConversationHistory: 100,
    longTermEnabled: true,
    longTermDbPath: '~/.paicli/memory.db',
    tokenBudgetMode: 'balanced',
    compressionThreshold: 0.8,
  },

  policy: {
    hitlMode: 'auto',
    pathGuardEnabled: true,
    commandBlacklist: [
      'sudo',
      'rm -rf /',
      'rm -rf ~',
      'mkfs',
      'dd if=/dev/zero',
      ':(){:|:&};:',
      'chmod -R 777 /',
    ],
    auditLogPath: '~/.paicli/audit.jsonl',
  },

  prompt: {
    personality: 'default',
    agentMode: 'react',
    customPromptPaths: [],
  },

  features: {
    mcp: true,
    skill: true,
    memory: true,
    auditLog: true,
    contextCompression: true,
  },
}
