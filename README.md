# PaiCLI TypeScript

PaiCLI TypeScript 是一个面向终端的 AI Agent CLI。它把 PaiCLI 的核心交互迁移到 Node.js / TypeScript 技术栈，提供命令行对话、工具调用、MCP Server、SDK 查询引擎、长期记忆和安全策略等能力。

当前版本是早期实现，适合继续迭代 Agent CLI、工具系统、MCP 集成和多 Agent 编排能力。

## 实测截图

键入 `pnpm paicli`，就可以看到运行结果了。

![](https://cdn.paicoding.com/stutymore/qoder-desktop-release-20260628234804.png)

整体还不错哈。

键入 `联网搜一下沉默王二是谁啊？`，来看看整体的效果。

![](https://cdn.paicoding.com/stutymore/qoder-desktop-release-20260628234944.png)

tool use 可用，Web search 工具也可用。

![](https://cdn.paicoding.com/stutymore/qoder-desktop-release-20260628235020.png)

思考过程和最终的 response 也都正确。

真不错，真不错。

![](https://cdn.paicoding.com/stutymore/qoder-desktop-release-20260628235059.png)

## 特性

- Commander.js CLI 入口，支持交互模式和 `-p/--prompt` 单次查询模式。
- DeepSeek LLM 客户端。
- ReAct Agent 核心循环，支持流式文本、工具调用和工具结果回传。
- 内置工具：读写文件、列目录、glob、grep、bash、web search、web fetch、save memory。
- MCP Server 模式，可通过 HTTP 或 stdio 暴露内置工具。
- SDK 入口，方便在其他 Node.js 程序中复用 `QueryEngine`、工具注册表和 Agent。
- 安全策略：路径围栏、命令黑名单、HITL 审批。
- 长期记忆基于 SQLite。
- Vitest 回归测试覆盖 CLI/SDK/MCP、工具、安全策略和 LLM 流式解析。

## 环境要求

- Node.js >= 18
- pnpm

## 安装与构建

```bash
pnpm install
pnpm build
```

开发期运行：

```bash
pnpm paicli --help
```

构建产物运行：

```bash
node dist/bin/paicli.js --help
```

## 配置

PaiCLI 会按以下优先级合并配置：

1. 默认配置
2. `~/.paicli/config.json`
3. 项目级 `.paicli/config.json`
4. 项目级 `.env`
5. CLI 参数
6. 当前进程环境变量

DeepSeek 配置示例：

```bash
PAICLI_PROVIDER=deepseek
PAICLI_MODEL=deepseek-v4-flash
PAICLI_API_KEY=your_deepseek_key
```

## CLI 用法

查看帮助：

```bash
pnpm paicli --help
```

交互模式：

```bash
pnpm paicli
```

单次查询：

```bash
pnpm paicli -p "帮我总结这个项目"
```

指定模型：

```bash
pnpm paicli --provider deepseek --model deepseek-v4-flash -p "hello"
```

切换到 DeepSeek V4 Pro：

```bash
pnpm paicli --provider deepseek --model deepseek-v4-pro -p "hello"
```

## MCP Server

HTTP 模式：

```bash
node dist/bin/paicli.js mcp serve --transport http --port 3000
```

测试工具列表：

```bash
curl -sS -X POST http://127.0.0.1:3000 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

调用工具：

```bash
curl -sS -X POST http://127.0.0.1:3000 \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"glob","arguments":{"pattern":"package.json"}}}'
```

## SDK 用法

```ts
import { QueryEngine, ToolRegistry, getBuiltinTools, createLlmClient } from 'paicli-ts/sdk'
import { loadConfig } from 'paicli-ts'

const config = loadConfig({ projectRoot: process.cwd() })
const llmClient = createLlmClient(config.llm)
const toolRegistry = new ToolRegistry()
toolRegistry.registerAll(getBuiltinTools())

const engine = new QueryEngine({
  llmClient,
  toolRegistry,
  config,
  cwd: process.cwd(),
})

const result = await engine.askComplete('Explain this project')
console.log(result.text)
```

## 开发命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

当前测试覆盖：

- 类型与工具工厂
- 配置加载与 `.env`
- 路径围栏、命令黑名单、HITL
- DeepSeek 流式工具调用
- AbortSignal 和错误传播
- MCP HTTP transport
- SQLite 记忆写入

## 发布

项目配置了 `prepack`，打包前会自动构建：

```bash
npm pack --dry-run
```

## License

MIT
