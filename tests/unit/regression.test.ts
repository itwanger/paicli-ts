import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { loadConfig } from '../../src/config/Config.js'
import { expandHomePath } from '../../src/config/paths.js'
import { OpenAICompatibleClient } from '../../src/llm/providers/OpenAICompatibleClient.js'
import { DeepSeekClient } from '../../src/llm/providers/DeepSeekClient.js'
import { PromptAssembler } from '../../src/prompt/PromptAssembler.js'
import { query } from '../../src/query.js'
import { QueryEngine } from '../../src/QueryEngine.js'
import { ToolRegistry } from '../../src/tools/registry.js'
import { buildTool } from '../../src/tools/Tool.js'
import { StreamingToolExecutor } from '../../src/tools/executor.js'
import { ReadFileTool } from '../../src/tools/builtins/ReadFileTool.js'
import { ListDirTool } from '../../src/tools/builtins/ListDirTool.js'
import { GlobTool } from '../../src/tools/builtins/GlobTool.js'
import { BashTool } from '../../src/tools/builtins/BashTool.js'
import { SaveMemoryTool } from '../../src/tools/builtins/SaveMemoryTool.js'
import { LongTermMemory } from '../../src/memory/LongTermMemory.js'
import { HttpMcpConnection } from '../../src/mcp/McpConnection.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port)
    })
  })
}

describe('regressions', () => {
  it('loads project .env below CLI overrides and expands home paths', () => {
    const dir = tempDir('paicli-config-')
    mkdirSync(join(dir, '.paicli'), { recursive: true })
    writeFileSync(join(dir, '.paicli', 'config.json'), JSON.stringify({ llm: { model: 'config-model' } }))
    writeFileSync(join(dir, '.env'), 'PAICLI_MODEL=env-model\nPAICLI_PROVIDER=openai\n')

    const oldModel = process.env.PAICLI_MODEL
    const oldProvider = process.env.PAICLI_PROVIDER
    delete process.env.PAICLI_MODEL
    delete process.env.PAICLI_PROVIDER
    try {
      const config = loadConfig({ projectRoot: dir, overrides: { llm: { model: 'cli-model' } as never } })
      expect(config.llm.model).toBe('cli-model')
      expect(config.llm.provider).toBe('openai')
      expect(config.memory.longTermDbPath).toBe(expandHomePath('~/.paicli/memory.db'))
    } finally {
      if (oldModel === undefined) delete process.env.PAICLI_MODEL
      else process.env.PAICLI_MODEL = oldModel
      if (oldProvider === undefined) delete process.env.PAICLI_PROVIDER
      else process.env.PAICLI_PROVIDER = oldProvider
    }
  })

  it('uses project prompt templates before builtin templates', () => {
    const root = tempDir('paicli-prompt-')
    const builtin = join(root, 'builtin')
    const project = join(root, 'project')
    mkdirSync(builtin, { recursive: true })
    mkdirSync(project, { recursive: true })
    writeFileSync(join(builtin, 'base.md'), 'builtin base')
    writeFileSync(join(project, 'base.md'), 'project base')

    const prompt = new PromptAssembler(builtin, [project]).assemble({
      date: 'today',
      model: 'model',
      tools: [],
      cwd: root,
      agentMode: 'react',
    })

    expect(prompt.startsWith('project base')).toBe(true)
  })

  it('keeps file tools inside cwd and returns list/glob output on Node 20', async () => {
    const root = tempDir('paicli-tools-')
    const outside = tempDir('paicli-outside-')
    writeFileSync(join(root, 'a.txt'), 'hello\n')
    writeFileSync(join(outside, 'secret.txt'), 'secret\n')
    const context = { cwd: root, config: { policy: { pathGuardEnabled: true } } }

    const blocked = await ReadFileTool.execute({ path: join(outside, 'secret.txt') }, 'read', context)
    expect(blocked.isError).toBe(true)
    expect(blocked.content).toContain('outside project root')

    const list = await ListDirTool.execute({ path: '.', depth: 1 }, 'list', context)
    expect(list.isError).toBeUndefined()
    expect(list.content).toContain('a.txt')

    const glob = await GlobTool.execute({ pattern: '*.txt' }, 'glob', context)
    expect(glob.isError).toBeUndefined()
    expect(glob.content).toContain('a.txt')
  })

  it('blocks blacklisted shell commands and requires approval for high-risk tools', async () => {
    const root = tempDir('paicli-bash-')
    const direct = await BashTool.execute({ command: 'printf sudo' }, 'bash1', { cwd: root, config: {} })
    expect(direct.isError).toBe(true)
    expect(direct.content).toContain('blocked by security policy')

    const registry = new ToolRegistry()
    registry.register(BashTool)
    const executor = new StreamingToolExecutor(registry)
    executor.add({ id: 'bash2', name: 'bash', input: { command: 'echo ok' } })
    const [result] = await executor.executeAll({
      cwd: root,
      config: { policy: { hitlMode: 'auto', commandBlacklist: [] } },
    })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('denied by approval policy')
  })

  it('does not duplicate OpenAI tool calls when finish_reason is tool_calls', async () => {
    let requestCount = 0
    const server = createServer((_req, res) => {
      requestCount++
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      if (requestCount === 1) {
        res.write(`data: ${JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'echo_tool', arguments: '{"value":2}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        })}\n\n`)
      } else {
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
    })
    const port = await listen(server)

    const client = new OpenAICompatibleClient({
      apiKey: 'x',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'fake',
      maxTokens: 100,
      temperature: 0,
      timeout: 5_000,
      providerName: 'test',
    })
    let executions = 0
    const registry = new ToolRegistry()
    registry.register(buildTool({
      name: 'echo_tool',
      description: 'echo',
      inputSchema: z.object({ value: z.number() }),
      isReadOnly: true,
      isConcurrencySafe: true,
      async call(input) {
        executions++
        return { content: `echo ${input.value}` }
      },
    }))

    for await (const _event of query({ llmClient: client, toolRegistry: registry, systemPrompt: 's', userMessage: 'u', cwd: process.cwd() })) {
      // consume
    }
    server.close()

    expect(executions).toBe(1)
  })

  it('honors external abort signals without immediate timeout overflow', async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] })}\n\n`)
        res.write('data: [DONE]\n\n')
        res.end()
      }, 30)
    })
    const port = await listen(server)
    const client = new OpenAICompatibleClient({
      apiKey: 'x',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'fake',
      maxTokens: 100,
      temperature: 0,
      timeout: 1_000,
      providerName: 'test',
    })

    const events = []
    const abortController = new AbortController()
    for await (const event of client.chat([], [], { abortSignal: abortController.signal })) {
      events.push(event)
    }
    server.close()

    expect(events.some((event) => event.type === 'text_delta' && event.text === 'ok')).toBe(true)
  })

  it('emits thinking deltas from OpenAI-compatible reasoning_content chunks', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({
        choices: [{ delta: { reasoning_content: '先分析一下。' } }],
      })}\n\n`)
      res.write(`data: ${JSON.stringify({
        choices: [{ delta: { content: '结论' }, finish_reason: 'stop' }],
      })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    })
    const port = await listen(server)
    const client = new OpenAICompatibleClient({
      apiKey: 'x',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'fake',
      maxTokens: 100,
      temperature: 0,
      timeout: 1_000,
      providerName: 'test',
    })

    const events = []
    for await (const event of client.chat([], [])) {
      events.push(event)
    }
    server.close()

    expect(events).toContainEqual({ type: 'thinking_delta', thinking: '先分析一下。' })
    expect(events).toContainEqual({ type: 'text_delta', text: '结论' })
  })

  it('replays DeepSeek reasoning_content when continuing after tool calls', async () => {
    let requestCount = 0
    let secondRequestBody: Record<string, unknown> | undefined

    const server = createServer(async (req, res) => {
      requestCount++
      let body = ''
      for await (const chunk of req) body += chunk
      if (requestCount === 2) {
        secondRequestBody = JSON.parse(body) as Record<string, unknown>
      }

      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      if (requestCount === 1) {
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: { reasoning_content: '先分析。' } }],
        })}\n\n`)
        res.write(`data: ${JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'echo_tool', arguments: '{"value":2}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        })}\n\n`)
      } else {
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }],
        })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
    })
    const port = await listen(server)

    const client = new DeepSeekClient({
      apiKey: 'x',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'deepseek-v4-flash',
      maxTokens: 100,
      temperature: 0,
      timeout: 5_000,
    })
    const registry = new ToolRegistry()
    registry.register(buildTool({
      name: 'echo_tool',
      description: 'echo',
      inputSchema: z.object({ value: z.number() }),
      isReadOnly: true,
      isConcurrencySafe: true,
      async call(input) {
        return { content: `echo ${input.value}` }
      },
    }))

    const events = []
    for await (const event of query({ llmClient: client, toolRegistry: registry, systemPrompt: 's', userMessage: 'u', cwd: process.cwd() })) {
      events.push(event)
    }
    server.close()

    expect(requestCount).toBe(2)
    const messages = secondRequestBody?.messages as Array<Record<string, unknown>>
    const assistantWithToolCall = messages.find((message) => message.role === 'assistant' && message.tool_calls)
    expect(assistantWithToolCall?.reasoning_content).toBe('先分析。')
    expect(events).toContainEqual({ type: 'text_delta', text: 'done' })
  })

  it('does not replay reasoning_content for generic OpenAI-compatible providers', async () => {
    let requestBody: Record<string, unknown> | undefined
    const server = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      requestBody = JSON.parse(body) as Record<string, unknown>
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(`data: ${JSON.stringify({
        choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
      })}\n\n`)
      res.write('data: [DONE]\n\n')
      res.end()
    })
    const port = await listen(server)
    const client = new OpenAICompatibleClient({
      apiKey: 'x',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'fake',
      maxTokens: 100,
      temperature: 0,
      timeout: 1_000,
      providerName: 'test',
    })

    for await (const _event of client.chat([{
      type: 'assistant',
      content: [{ type: 'thinking', thinking: 'hidden' }, { type: 'text', text: 'answer' }],
    }], [])) {
      // consume
    }
    server.close()

    const messages = requestBody?.messages as Array<Record<string, unknown>>
    expect(messages[0]).toEqual({ role: 'assistant', content: 'answer' })
  })

  it('corrects web tool inputs back to the explicit user domain', async () => {
    let requestCount = 0
    let secondRequestBody: Record<string, unknown> | undefined
    const server = createServer(async (req, res) => {
      requestCount++
      let body = ''
      for await (const chunk of req) body += chunk
      if (requestCount === 2) {
        secondRequestBody = JSON.parse(body) as Record<string, unknown>
      }

      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      if (requestCount === 1) {
        res.write(`data: ${JSON.stringify({
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'web_fetch', arguments: '{"url":"https://ai.javabetter.com"}' },
              }],
            },
            finish_reason: 'tool_calls',
          }],
        })}\n\n`)
      } else {
        res.write(`data: ${JSON.stringify({
          choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }],
        })}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
    })
    const port = await listen(server)
    const client = new OpenAICompatibleClient({
      apiKey: 'x',
      baseUrl: `http://127.0.0.1:${port}`,
      model: 'fake',
      maxTokens: 100,
      temperature: 0,
      timeout: 5_000,
      providerName: 'test',
    })
    const registry = new ToolRegistry()
    registry.register(buildTool({
      name: 'web_fetch',
      description: 'fetch',
      inputSchema: z.object({ url: z.string() }),
      isReadOnly: true,
      isConcurrencySafe: true,
      async call(input) {
        return { content: `fetched ${input.url}` }
      },
    }))

    const toolCalls: Array<Record<string, unknown>> = []
    const toolResults: string[] = []
    for await (const event of query({
      llmClient: client,
      toolRegistry: registry,
      systemPrompt: 's',
      userMessage: 'ai.javabetter.cn 这个网站你觉得怎么样？',
      cwd: process.cwd(),
    })) {
      if (event.type === 'tool_call') toolCalls.push(event.input)
      if (event.type === 'tool_result') toolResults.push(event.result)
    }
    server.close()

    expect(toolCalls[0]?.url).toBe('https://ai.javabetter.cn/')
    expect(toolResults[0]).toBe('fetched https://ai.javabetter.cn/')

    const messages = secondRequestBody?.messages as Array<Record<string, unknown>>
    const assistantWithToolCall = messages.find((message) => message.role === 'assistant' && message.tool_calls)
    const sentToolCall = (assistantWithToolCall?.tool_calls as Array<Record<string, unknown>>)[0]
    const sentFunction = sentToolCall.function as Record<string, unknown>
    expect(sentFunction.arguments).toBe('{"url":"https://ai.javabetter.cn/"}')
  })

  it('persists save_memory tool entries to SQLite', async () => {
    const root = tempDir('paicli-memory-')
    const dbPath = join(root, 'memory.db')
    const result = await SaveMemoryTool.execute(
      { content: 'remember this', category: 'test' },
      'memory',
      { cwd: root, config: { memory: { longTermDbPath: dbPath } } },
    )
    expect(result.isError).toBeUndefined()
    expect(existsSync(dbPath)).toBe(true)

    const memory = new LongTermMemory(dbPath)
    try {
      expect(memory.search('remember', 1)[0]?.content).toBe('remember this')
    } finally {
      memory.close()
    }
  })

  it('sends JSON-RPC requests over MCP HTTP transport', async () => {
    const server = createServer(async (req, res) => {
      let body = ''
      for await (const chunk of req) body += chunk
      const payload = JSON.parse(body) as { method: string; params: Record<string, unknown>; id: number }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id: payload.id, result: { method: payload.method, params: payload.params } }))
    })
    const port = await listen(server)

    const connection = new HttpMcpConnection(`http://127.0.0.1:${port}`)
    await connection.connect()
    const result = await connection.sendRequest('tools/list', {})
    await connection.disconnect()
    server.close()

    expect(result).toEqual({ method: 'tools/list', params: {} })
  })

  it('throws from askComplete when the LLM stream emits an error', async () => {
    const registry = new ToolRegistry()
    const client = {
      modelName: 'fake',
      providerName: 'fake',
      maxContextWindow: 1000,
      capabilities: { tools: true, images: false, promptCache: false },
      async *chat() {
        yield { type: 'error' as const, error: new Error('boom'), recoverable: false }
      },
    }

    const engine = new QueryEngine({
      llmClient: client,
      toolRegistry: registry,
      config: loadConfig({ projectRoot: tempDir('paicli-engine-') }),
      cwd: process.cwd(),
    })

    await expect(engine.askComplete('hello')).rejects.toThrow('boom')
  })
})
