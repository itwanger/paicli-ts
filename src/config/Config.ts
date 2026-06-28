/**
 * PaiCLI 配置加载器
 * 支持多源配置合并：默认 < 用户级 < 项目级 < 环境变量
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { PaiCliConfig } from '../types/config.js'
import { DEFAULT_CONFIG } from './defaults.js'
import { expandHomePath } from './paths.js'

/** 配置加载选项 */
export interface ConfigLoadOptions {
  /** 项目根目录 */
  projectRoot?: string
  /** 覆盖配置 (来自 CLI 参数) */
  overrides?: Partial<PaiCliConfig>
}

/**
 * 加载并合并配置
 * 优先级：环境变量 > CLI 覆盖 > 项目级 config.json > 用户级 config.json > 默认配置
 */
export function loadConfig(options: ConfigLoadOptions = {}): PaiCliConfig {
  const { projectRoot, overrides } = options

  // 1. 默认配置
  let config = deepClone(DEFAULT_CONFIG)

  // 2. 用户级配置 ~/.paicli/config.json
  const userConfigPath = join(homedir(), '.paicli', 'config.json')
  if (existsSync(userConfigPath)) {
    const userConfig = readJsonFile(userConfigPath)
    if (userConfig) {
      config = deepMerge(config as unknown as Record<string, unknown>, userConfig) as unknown as PaiCliConfig
    }
  }

  // 3. 项目级配置 .paicli/config.json
  if (projectRoot) {
    const projectConfigPath = join(projectRoot, '.paicli', 'config.json')
    if (existsSync(projectConfigPath)) {
      const projectConfig = readJsonFile(projectConfigPath)
      if (projectConfig) {
        config = deepMerge(config as unknown as Record<string, unknown>, projectConfig) as unknown as PaiCliConfig
      }
    }
  }

  // 4. .env 文件覆盖
  if (projectRoot) {
    const envPath = join(projectRoot, '.env')
    if (existsSync(envPath)) {
      config = applyEnvironmentOverrides(config, readEnvFile(envPath))
    }
  }

  // 5. CLI 参数覆盖
  if (overrides) {
    config = deepMerge(config as unknown as Record<string, unknown>, overrides) as unknown as PaiCliConfig
  }

  // 6. 环境变量覆盖（最高优先级）
  config = applyEnvironmentOverrides(config)

  return normalizeConfig(config)
}

/**
 * 从环境变量应用配置覆盖
 */
function applyEnvironmentOverrides(
  config: PaiCliConfig,
  env: Record<string, string | undefined> = process.env,
): PaiCliConfig {

  // LLM 配置
  if (env.PAICLI_API_KEY) config.llm.apiKey = env.PAICLI_API_KEY
  if (env.PAICLI_PROVIDER) config.llm.provider = env.PAICLI_PROVIDER
  if (env.PAICLI_MODEL) config.llm.model = env.PAICLI_MODEL
  if (env.PAICLI_BASE_URL) config.llm.baseUrl = env.PAICLI_BASE_URL
  if (env.PAICLI_MAX_TOKENS) config.llm.maxTokens = parseInt(env.PAICLI_MAX_TOKENS, 10)
  if (env.PAICLI_TEMPERATURE) config.llm.temperature = parseFloat(env.PAICLI_TEMPERATURE)

  // 渲染模式
  if (env.PAICLI_RENDER_MODE === 'plain' || env.PAICLI_RENDER_MODE === 'inline') {
    config.renderMode = env.PAICLI_RENDER_MODE
  }

  // 功能开关
  if (env.PAICLI_MCP === 'false') config.features.mcp = false
  if (env.PAICLI_SKILL === 'false') config.features.skill = false
  if (env.PAICLI_MEMORY === 'false') config.features.memory = false

  // HITL 模式
  if (env.PAICLI_HITL === 'always' || env.PAICLI_HITL === 'auto' || env.PAICLI_HITL === 'never') {
    config.policy.hitlMode = env.PAICLI_HITL
  }

  return config
}

/** 读取 .env 文件 */
function readEnvFile(path: string): Record<string, string> {
  const result: Record<string, string> = {}
  try {
    const content = readFileSync(path, 'utf-8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const equalIndex = line.indexOf('=')
      if (equalIndex <= 0) continue
      const key = line.slice(0, equalIndex).trim()
      let value = line.slice(equalIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  } catch {
    return {}
  }
  return result
}

function normalizeConfig(config: PaiCliConfig): PaiCliConfig {
  config.memory.longTermDbPath = expandHomePath(config.memory.longTermDbPath)
  config.policy.auditLogPath = expandHomePath(config.policy.auditLogPath)
  return config
}

/** 安全读取 JSON 文件 */
function readJsonFile(path: string): Partial<PaiCliConfig> | null {
  try {
    const content = readFileSync(path, 'utf-8')
    return JSON.parse(content) as Partial<PaiCliConfig>
  } catch {
    return null
  }
}

/** 深度克隆 */
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/** 深度合并 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const result = { ...target } as Record<string, unknown>

  for (const key of Object.keys(source)) {
    const targetVal = (target as Record<string, unknown>)[key]
    const sourceVal = source[key]

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal
    }
  }

  return result as T
}

/** 获取配置文件路径列表 */
export function getConfigPaths(projectRoot?: string): string[] {
  const paths: string[] = [
    join(homedir(), '.paicli', 'config.json'),
  ]
  if (projectRoot) {
    paths.push(join(projectRoot, '.paicli', 'config.json'))
  }
  return paths
}
