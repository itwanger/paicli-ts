/**
 * PaiCLI 工具工厂 — buildTool
 * 参考 Claude Code 的 buildTool 模式，提供验证、权限、执行的统一生命周期
 */

import { z, type ZodType } from 'zod'
import type { ToolContext, ToolDefinition, ToolMeta, ToolParameters, ToolResult, DangerLevel } from '../types/tool.js'
import { DEFAULT_TOOL_TIMEOUT } from '../types/tool.js'

/** buildTool 配置 */
export interface BuildToolConfig<TInput = Record<string, unknown>> {
  /** 工具名称 (snake_case) */
  name: string
  /** 工具描述 */
  description: string
  /** Zod 输入验证 Schema */
  inputSchema: ZodType<TInput>
  /** 是否只读 */
  isReadOnly: boolean
  /** 是否可并发执行 */
  isConcurrencySafe: boolean
  /** 危险等级 */
  dangerLevel?: DangerLevel
  /** 超时时间 (ms) */
  timeout?: number
  /** 执行函数 — AsyncGenerator 支持流式结果 */
  call: (input: TInput, context: ToolContext) => AsyncGenerator<ToolResultChunk> | Promise<ToolResultChunk>
}

/** 工具结果块（流式） */
export interface ToolResultChunk {
  /** 文本内容 */
  content: string
  /** 是否为错误 */
  isError?: boolean
  /** 展示摘要 */
  displaySummary?: string
}

/** 构建后的工具实例 */
export interface Tool<TInput = Record<string, unknown>> {
  /** 工具名称 */
  readonly name: string
  /** 工具描述 */
  readonly description: string
  /** 是否只读 */
  readonly isReadOnly: boolean
  /** 是否可并发 */
  readonly isConcurrencySafe: boolean
  /** 工具元信息 */
  readonly meta: ToolMeta
  /** 输入 Schema */
  readonly inputSchema: ZodType<TInput>
  /** 获取 LLM 工具定义 */
  getDefinition(): ToolDefinition
  /** 验证输入 */
  validate(input: unknown): TInput
  /** 执行工具 */
  execute(input: TInput, toolUseId: string, context: ToolContext): Promise<ToolResult>
  /** 流式执行工具 */
  executeStream(input: TInput, toolUseId: string, context: ToolContext): AsyncGenerator<ToolResultChunk>
}

/**
 * buildTool 工厂函数
 * 创建符合 PaiCLI 规范的工具实例
 */
export function buildTool<TInput = Record<string, unknown>>(config: BuildToolConfig<TInput>): Tool<TInput> {
  const meta: ToolMeta = {
    dangerLevel: config.dangerLevel ?? (config.isReadOnly ? 'safe' : 'medium'),
    requiresApproval: (config.dangerLevel ?? 'medium') === 'high',
    timeout: config.timeout ?? DEFAULT_TOOL_TIMEOUT,
  }

  return {
    name: config.name,
    description: config.description,
    isReadOnly: config.isReadOnly,
    isConcurrencySafe: config.isConcurrencySafe,
    meta,
    inputSchema: config.inputSchema,

    getDefinition(): ToolDefinition {
      // 从 Zod Schema 提取 JSON Schema
      const jsonSchema = zodToJsonSchema(config.inputSchema)
      return {
        name: config.name,
        description: config.description,
        parameters: jsonSchema as ToolParameters,
        isReadOnly: config.isReadOnly,
        isConcurrencySafe: config.isConcurrencySafe,
      }
    },

    validate(input: unknown): TInput {
      const result = config.inputSchema.safeParse(input)
      if (!result.success) {
        throw new ToolValidationError(config.name, result.error)
      }
      return result.data
    },

    async execute(input: TInput, toolUseId: string, context: ToolContext): Promise<ToolResult> {
      const validatedInput = this.validate(input)
      const result = config.call(validatedInput, context)

      if (Symbol.asyncIterator in (result as AsyncGenerator<ToolResultChunk>)) {
        // 流式结果 — 合并所有 chunk
        let content = ''
        let isError = false
        let displaySummary = ''
        for await (const chunk of result as AsyncGenerator<ToolResultChunk>) {
          content += chunk.content
          if (chunk.isError) isError = true
          if (chunk.displaySummary) displaySummary = chunk.displaySummary
        }
        return { toolUseId, content, isError, displaySummary }
      }

      // 非流式结果
      const chunk = await (result as Promise<ToolResultChunk>)
      return {
        toolUseId,
        content: chunk.content,
        isError: chunk.isError,
        displaySummary: chunk.displaySummary,
      }
    },

    async *executeStream(input: TInput, _toolUseId: string, context: ToolContext): AsyncGenerator<ToolResultChunk> {
      const validatedInput = this.validate(input)
      const result = config.call(validatedInput, context)

      if (Symbol.asyncIterator in (result as AsyncGenerator<ToolResultChunk>)) {
        yield* result as AsyncGenerator<ToolResultChunk>
      } else {
        yield await (result as Promise<ToolResultChunk>)
      }
    },
  }
}

/** 工具验证错误 */
export class ToolValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly zodError: z.ZodError,
  ) {
    super(`Tool "${toolName}" input validation failed: ${zodError.message}`)
    this.name = 'ToolValidationError'
  }
}

/**
 * Zod → JSON Schema 简易转换
 * 仅支持常用类型，生产环境可用 zod-to-json-schema 库替换
 */
function zodToJsonSchema(schema: ZodType): { type: 'object'; properties: Record<string, unknown>; required?: string[] } {
  // 简易实现 — 处理 z.object
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, ZodType>
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const unwrapped = unwrapOptional(value)
      properties[key] = zodTypeToJsonProperty(unwrapped)
      if (!(value instanceof z.ZodOptional)) {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    }
  }

  return { type: 'object', properties: {} }
}

function unwrapOptional(schema: ZodType): ZodType {
  if (schema instanceof z.ZodOptional) {
    return unwrapOptional((schema as z.ZodOptional<ZodType>)._def.innerType)
  }
  return schema
}

function zodTypeToJsonProperty(schema: ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodString) {
    return { type: 'string', description: schema.description ?? '' }
  }
  if (schema instanceof z.ZodNumber) {
    return { type: 'number', description: schema.description ?? '' }
  }
  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean', description: schema.description ?? '' }
  }
  if (schema instanceof z.ZodArray) {
    const itemType = zodTypeToJsonProperty((schema as z.ZodArray<ZodType>)._def.type)
    return { type: 'array', items: itemType, description: schema.description ?? '' }
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: (schema as z.ZodEnum<[string, ...string[]]>)._def.values }
  }
  if (schema instanceof z.ZodObject) {
    return zodToJsonSchema(schema)
  }
  return { type: 'string' }
}
