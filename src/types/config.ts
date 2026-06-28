/**
 * PaiCLI 配置类型定义
 */

/** 完整配置类型 */
export interface PaiCliConfig {
  /** LLM 配置 */
  llm: LlmConfig
  /** 渲染模式 */
  renderMode: RenderMode
  /** 工具配置 */
  tools: ToolsConfig
  /** MCP 配置 */
  mcp: McpConfig
  /** 记忆配置 */
  memory: MemoryConfig
  /** 安全策略配置 */
  policy: PolicyConfig
  /** Prompt 配置 */
  prompt: PromptConfig
  /** 功能开关 */
  features: FeatureFlags
}

/** LLM 配置 */
export interface LlmConfig {
  /** 当前使用的 provider */
  provider: string
  /** 模型名称 */
  model: string
  /** API Key */
  apiKey: string
  /** API Base URL (可选，用于自定义端点) */
  baseUrl?: string
  /** 最大 Token 数 */
  maxTokens: number
  /** 温度 */
  temperature: number
  /** 超时时间 (ms) */
  timeout: number
  /** Provider 特定配置 */
  providerOptions?: Record<string, unknown>
}

/** 渲染模式 */
export type RenderMode = 'inline' | 'plain'

/** 工具配置 */
export interface ToolsConfig {
  /** 启用的工具列表 (空 = 全部) */
  enabled: string[]
  /** 禁用的工具列表 */
  disabled: string[]
  /** 工具超时 (ms) */
  timeout: number
  /** 批量执行超时 (ms) */
  batchTimeout: number
  /** 最大并发读工具数 */
  maxConcurrentRead: number
}

/** MCP 配置 */
export interface McpConfig {
  /** MCP 服务列表 */
  servers: McpServerConfig[]
  /** 是否自动启动 MCP 服务 */
  autoStart: boolean
}

/** MCP 服务配置 */
export interface McpServerConfig {
  /** 服务名称 */
  name: string
  /** 传输方式 */
  transport: 'stdio' | 'http'
  /** stdio: 命令; http: URL */
  endpoint: string
  /** stdio: 参数 */
  args?: string[]
  /** 环境变量 */
  env?: Record<string, string>
  /** 是否启用 */
  enabled: boolean
}

/** 记忆配置 */
export interface MemoryConfig {
  /** 对话历史最大条数 */
  maxConversationHistory: number
  /** 是否启用长期记忆 */
  longTermEnabled: boolean
  /** 长期记忆数据库路径 */
  longTermDbPath: string
  /** Token 预算模式 */
  tokenBudgetMode: TokenBudgetMode
  /** 上下文压缩阈值 (0-1，比例) */
  compressionThreshold: number
}

/** Token 预算模式 */
export type TokenBudgetMode = 'short' | 'balanced' | 'long'

/** 安全策略配置 */
export interface PolicyConfig {
  /** HITL 模式 */
  hitlMode: HitlMode
  /** 路径围栏是否启用 */
  pathGuardEnabled: boolean
  /** 命令黑名单 */
  commandBlacklist: string[]
  /** 审计日志路径 */
  auditLogPath: string
}

/** HITL 模式 */
export type HitlMode = 'always' | 'auto' | 'never'

/** Prompt 配置 */
export interface PromptConfig {
  /** 人格名称 */
  personality: string
  /** Agent 模式 */
  agentMode: AgentMode
  /** 自定义 prompt 路径 */
  customPromptPaths: string[]
}

/** Agent 模式 */
export type AgentMode = 'react' | 'plan' | 'team'

/** 功能开关 */
export interface FeatureFlags {
  /** 启用 MCP */
  mcp: boolean
  /** 启用 Skill */
  skill: boolean
  /** 启用记忆系统 */
  memory: boolean
  /** 启用审计日志 */
  auditLog: boolean
  /** 启用上下文压缩 */
  contextCompression: boolean
}
