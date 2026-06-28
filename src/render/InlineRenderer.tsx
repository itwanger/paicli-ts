/**
 * Ink renderer for interactive terminal sessions.
 *
 * The layout mirrors Claude Code's fullscreen shape at a smaller scale:
 * transcript scroll area above, prompt input above the pinned footer, and
 * status/footer chrome fixed at the bottom.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, render, useInput, type Instance } from 'ink'
import type { Renderer, StatusInfo, ApprovalRequest, ApprovalResult } from './Renderer.js'
import type { StreamEvent } from '../llm/types.js'
import type { ToolResult } from '../types/tool.js'
import { LineReader } from './LineReader.js'
import { MarkdownText } from './MarkdownText.js'

type TranscriptKind = 'welcome' | 'user' | 'assistant' | 'thinking' | 'tool' | 'tool_result' | 'error' | 'command'

interface TranscriptItem {
  id: number
  kind: TranscriptKind
  text: string
  title?: string
  isError?: boolean
}

interface TuiState {
  version: string
  status: StatusInfo | null
  items: TranscriptItem[]
  inputActive: boolean
  inputValue: string
}

type Listener = (state: TuiState) => void

class TuiStore {
  private state: TuiState = {
    version: '',
    status: null,
    items: [],
    inputActive: false,
    inputValue: '',
  }

  private listeners = new Set<Listener>()

  getState(): TuiState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  update(updater: (state: TuiState) => TuiState): void {
    this.state = updater(this.state)
    for (const listener of this.listeners) listener(this.state)
  }
}

/**
 * InlineRenderer falls back to legacy console output when it is used without
 * start(), in tests, or in piped/non-TTY mode.
 */
export class InlineRenderer implements Renderer {
  readonly mode = 'inline' as const
  private instance: Instance | null = null
  private status: StatusInfo | null = null
  private readonly store = new TuiStore()
  private nextId = 1
  private pendingResolve: ((value: string) => void) | null = null
  private currentAssistantId: number | null = null
  private currentThinkingId: number | null = null
  private legacyLineReader: LineReader | null = null

  async start(): Promise<void> {
    if (!this.canUseTui()) return
    if (this.status) {
      this.store.update((state) => ({ ...state, status: this.status }))
    }
    this.instance = render(
      <PaiCliTui
        store={this.store}
        onSubmit={(value) => this.submitInput(value)}
      />,
      { exitOnCtrlC: false },
    )
  }

  async stop(): Promise<void> {
    this.legacyLineReader?.close()
    this.legacyLineReader = null
    this.instance?.unmount()
    this.instance = null
  }

  showWelcome(version: string): void {
    if (!this.isTuiActive()) {
      this.renderLegacyWelcome(version)
      return
    }
    this.store.update((state) => ({
      ...state,
      version,
      items: capItems([...state.items, this.createItem('welcome', '')]),
    }))
  }

  showPrompt(): void {
    if (!this.isTuiActive() && this.status) {
      this.renderLegacyStatusBar(this.status)
    }
  }

  beginThinking(): void {
    if (!this.isTuiActive()) {
      process.stdout.write('\x1b[34mThinking...\x1b[0m')
      return
    }
    this.currentAssistantId = null
    this.currentThinkingId = this.appendItem('thinking', '', 'Thinking')
  }

  appendThinking(text: string): void {
    if (!this.isTuiActive()) return
    if (this.currentThinkingId === null) this.beginThinking()
    this.appendToItem(this.currentThinkingId, text)
  }

  endThinking(): void {
    if (!this.isTuiActive()) {
      process.stdout.write('\r\x1b[K')
      return
    }
    this.currentThinkingId = null
  }

  beginText(): void {}

  appendText(text: string): void {
    if (!this.isTuiActive()) {
      process.stdout.write(text)
      return
    }
    if (this.currentAssistantId === null) {
      this.currentAssistantId = this.appendItem('assistant', '')
    }
    this.appendToItem(this.currentAssistantId, text)
  }

  endText(): void {
    if (!this.isTuiActive()) {
      console.log()
      return
    }
    this.currentAssistantId = null
    this.currentThinkingId = null
  }

  showToolCall(name: string, input: Record<string, unknown>): void {
    const summary = summarizeToolInput(input)
    this.currentAssistantId = null
    this.currentThinkingId = null
    if (!this.isTuiActive()) {
      console.log(`\x1b[33m> ${name}\x1b[0m(${summary})`)
      return
    }
    this.appendItem('tool', summary, name)
  }

  showToolResult(result: ToolResult): void {
    const title = result.displaySummary ?? (result.isError ? 'Tool error' : 'Tool result')
    const summary = result.content.slice(0, 1_200)
    this.currentAssistantId = null
    this.currentThinkingId = null
    if (!this.isTuiActive()) {
      if (result.isError) console.log(`\x1b[31merror\x1b[0m ${summary}`)
      else console.log(`\x1b[36mdone\x1b[0m ${summary}`)
      return
    }
    this.appendItem('tool_result', summary, title, result.isError)
  }

  handleStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'text_delta':
        this.appendText(event.text)
        break
      case 'thinking_delta':
        this.appendThinking(event.thinking)
        break
      case 'tool_use_start':
        this.showToolCall(event.name, {})
        break
      case 'message_end':
        this.endText()
        break
    }
  }

  showError(error: Error): void {
    if (!this.isTuiActive()) {
      console.error(`\x1b[31mError: ${error.message}\x1b[0m`)
      return
    }
    this.appendItem('error', error.message, 'Error', true)
  }

  showOutput(text: string): void {
    if (!this.isTuiActive()) {
      console.log(text)
      return
    }
    this.appendItem('command', text)
  }

  showStatus(status: StatusInfo): void {
    this.status = status
    if (!this.isTuiActive()) return
    this.store.update((state) => ({ ...state, status }))
  }

  async requestApproval(_request: ApprovalRequest): Promise<ApprovalResult> {
    return { decision: 'approve' }
  }

  async readInput(): Promise<string> {
    if (!this.isTuiActive()) {
      return this.readLegacyInput('\x1b[35m>\x1b[0m ')
    }

    return new Promise((resolve) => {
      this.pendingResolve = resolve
      this.store.update((state) => ({
        ...state,
        inputActive: true,
        inputValue: '',
      }))
    })
  }

  clear(): void {
    if (!this.isTuiActive()) {
      console.clear()
      return
    }
    this.currentAssistantId = null
    this.currentThinkingId = null
    this.store.update((state) => ({ ...state, items: [] }))
  }

  private submitInput(value: string): void {
    const resolve = this.pendingResolve
    if (!resolve) return
    this.pendingResolve = null
    const trimmed = value.trim()
    this.store.update((state) => ({
      ...state,
      inputActive: false,
      inputValue: '',
      items: trimmed ? capItems([...state.items, this.createItem('user', trimmed)]) : state.items,
    }))
    resolve(trimmed)
  }

  private appendItem(kind: TranscriptKind, text: string, title?: string, isError?: boolean): number {
    const item = this.createItem(kind, text, title, isError)
    this.store.update((state) => ({
      ...state,
      items: capItems([...state.items, item]),
    }))
    return item.id
  }

  private appendToItem(id: number | null, text: string): void {
    if (id === null || text.length === 0) return
    this.store.update((state) => ({
      ...state,
      items: state.items.map((item) => item.id === id ? { ...item, text: item.text + text } : item),
    }))
  }

  private createItem(kind: TranscriptKind, text: string, title?: string, isError?: boolean): TranscriptItem {
    return {
      id: this.nextId++,
      kind,
      text,
      title,
      isError,
    }
  }

  private canUseTui(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
  }

  private isTuiActive(): boolean {
    return this.instance !== null
  }

  private async readLegacyInput(prompt: string): Promise<string> {
    if (!this.legacyLineReader) {
      this.legacyLineReader = new LineReader(
        process.stdin,
        process.stdout,
        Boolean(process.stdin.isTTY && process.stdout.isTTY),
      )
    }
    return this.legacyLineReader.read(prompt)
  }

  private renderLegacyWelcome(version: string): void {
    const status = this.status
    const model = status?.model ?? 'unknown'
    const provider = status?.provider ? ` (${status.provider})` : ''
    const mcp = `${status?.connectedMcpServers ?? 0}/${status?.mcpServers ?? 0}`
    const skills = `${status?.loadedSkills ?? 0}/${status?.skills ?? 0}`
    const mode = status?.agentMode ?? 'ReAct'

    console.log()
    console.log(`  \x1b[92m\x1b[1m██████╗ \x1b[0m  \x1b[1mPaiCLI \x1b[92mπ\x1b[0m  \x1b[90mv${version}\x1b[0m`)
    console.log(`  \x1b[92m\x1b[1m  ██  ██╗\x1b[0m  \x1b[90mModel\x1b[0m ${model}${provider}`)
    console.log(`  \x1b[92m\x1b[1m  ██  ██║\x1b[0m  \x1b[90mMCP\x1b[0m ${mcp} · \x1b[90m${status?.toolCount ?? 0} tools\x1b[0m · ${skills} skills · ${mode}`)
    console.log(`  \x1b[92m\x1b[1m  ██  ██║\x1b[0m  \x1b[90mReAct · Plan · MCP · Browser · Image · Tools · Memory · RAG\x1b[0m`)
    console.log(`  \x1b[92m\x1b[1m  ╚╝  ╚╝\x1b[0m`)
    console.log()
    console.log('Tips for getting started:')
    console.log('1. Type / for commands and Tab completion')
    console.log('2. Ask coding questions, edit code or run commands')
    console.log('3. Attach context with @path or @image')
    console.log()
  }

  private renderLegacyStatusBar(status: StatusInfo): void {
    const width = process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 100
    const divider = '─'.repeat(Math.min(width, 140))
    const contextPercent = getContextPercent(status)
    const provider = status.provider ? ` (${status.provider})` : ''
    const ctx = `${contextPercent}% (${formatCompact(status.tokensUsed)}/${formatCompact(status.tokenLimit)})`
    const cwd = compactPath(status.cwd ?? process.cwd())
    const hitl = status.hitlMode ?? 'auto'
    const memory = status.memoryEnabled ? 'Memory' : 'Memory off'

    console.log(divider)
    console.log(
      `\x1b[93mYOLO Ctrl+Y to enable HITL\x1b[0m    ` +
      `\x1b[38;5;213m${status.loadedSkills ?? 0} skills\x1b[0m · ` +
      `\x1b[38;5;147m${status.connectedMcpServers ?? 0} MCP servers\x1b[0m`,
    )
    console.log(
      `\x1b[38;5;213mAuto Model\x1b[0m · \x1b[38;5;147m${status.model}${provider}\x1b[0m ` +
      `\x1b[92m${status.statusText ?? 'idle'}\x1b[0m · ` +
      `\x1b[36mctx\x1b[0m \x1b[92m${ctx}\x1b[0m · ` +
      `turns ${status.conversationTurns ?? 0} · ${memory} · hitl ${hitl} · ${cwd}`,
    )
  }
}

function PaiCliTui({ store, onSubmit }: { store: TuiStore; onSubmit: (value: string) => void }): React.ReactElement {
  const state = useStoreState(store)
  const size = useTerminalSize()
  const transcriptRows = Math.max(4, size.rows - 5)
  const visibleItems = useMemo(
    () => state.items.slice(-Math.max(4, transcriptRows)),
    [state.items, transcriptRows],
  )

  useInput((input, key) => {
    if (!state.inputActive) return
    if (key.ctrl && input.toLowerCase() === 'c') {
      onSubmit('/exit')
      return
    }
    if (key.return) {
      onSubmit(state.inputValue)
      return
    }
    if (key.backspace || key.delete) {
      store.update((current) => ({ ...current, inputValue: current.inputValue.slice(0, -1) }))
      return
    }
    if (!key.ctrl && !key.meta && input) {
      store.update((current) => ({ ...current, inputValue: current.inputValue + input }))
    }
  })

  return (
    <Box flexDirection="column" height={size.rows} width="100%" overflow="hidden">
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1}>
        {visibleItems.map((item) => <TranscriptRow key={item.id} item={item} status={state.status} version={state.version} />)}
        <Box flexGrow={1} />
      </Box>
      <Box flexDirection="column" flexShrink={0} width="100%">
        <PromptLine value={state.inputValue} active={state.inputActive} />
        <Footer status={state.status} columns={size.columns} />
      </Box>
    </Box>
  )
}

function useStoreState(store: TuiStore): TuiState {
  const [state, setState] = useState(store.getState())
  useEffect(() => store.subscribe(setState), [store])
  return state
}

function useTerminalSize(): { columns: number; rows: number } {
  const readSize = () => ({
    columns: process.stdout.columns && process.stdout.columns > 20 ? process.stdout.columns : 100,
    rows: process.stdout.rows && process.stdout.rows > 8 ? process.stdout.rows : 30,
  })
  const [size, setSize] = useState(readSize)
  useEffect(() => {
    const onResize = () => setSize(readSize())
    process.stdout.on('resize', onResize)
    return () => {
      process.stdout.off('resize', onResize)
    }
  }, [])
  return size
}

function TranscriptRow({ item, status, version }: { item: TranscriptItem; status: StatusInfo | null; version: string }): React.ReactElement {
  if (item.kind === 'welcome') return <WelcomePanel status={status} version={version} />
  if (item.kind === 'user') {
    return (
      <Box marginTop={1}>
        <Text color="magenta">{'>'} </Text>
        <Text bold>{item.text}</Text>
      </Box>
    )
  }
  if (item.kind === 'assistant') {
    return (
      <Box marginTop={1}>
        <MarkdownText text={item.text} />
      </Box>
    )
  }
  if (item.kind === 'thinking') {
    return (
      <Box marginTop={1} flexDirection="column">
        <Text color="blue">∴ Thinking</Text>
        {item.text ? (
          <Box paddingLeft={2}>
            <MarkdownText text={item.text} dimColor maxLines={6} />
          </Box>
        ) : null}
      </Box>
    )
  }
  if (item.kind === 'tool') {
    return (
      <Box marginTop={1} flexDirection="column">
        <Text wrap="wrap">
          <Text color="yellow">⚡ Tool call</Text>
          <Text dimColor> · </Text>
          <Text bold>{item.title ?? 'tool'}</Text>
          {item.text ? <Text dimColor>  {item.text}</Text> : null}
        </Text>
      </Box>
    )
  }
  if (item.kind === 'tool_result') {
    return (
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={item.isError ? 'red' : 'cyan'}>{item.isError ? '✗ Tool error' : '✓ Tool result'}</Text>
          {item.title ? <Text dimColor> · {item.title}</Text> : null}
        </Text>
        {item.text ? (
          <Box paddingLeft={2}>
            <MarkdownText text={item.text} dimColor maxLines={6} />
          </Box>
        ) : null}
      </Box>
    )
  }
  if (item.kind === 'error') {
    return (
      <Box marginTop={1}>
        <Text color="red">Error: {item.text}</Text>
      </Box>
    )
  }
  return (
    <Box marginTop={1}>
      <Text color="green" wrap="wrap">{item.text}</Text>
    </Box>
  )
}

function WelcomePanel({ status, version }: { status: StatusInfo | null; version: string }): React.ReactElement {
  const model = status?.model ?? 'unknown'
  const provider = status?.provider ? ` (${status.provider})` : ''
  const mcp = `${status?.connectedMcpServers ?? 0}/${status?.mcpServers ?? 0}`
  const skills = `${status?.loadedSkills ?? 0}/${status?.skills ?? 0}`
  const mode = status?.agentMode ?? 'ReAct'

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="green" bold>██████╗  </Text>
        <Text bold>PaiCLI </Text>
        <Text color="green">π </Text>
        <Text dimColor>v{version}</Text>
      </Box>
      <Box>
        <Text color="green" bold>  ██  ██╗  </Text>
        <Text dimColor>Model </Text>
        <Text>{model}{provider}</Text>
      </Box>
      <Box>
        <Text color="green" bold>  ██  ██║  </Text>
        <Text dimColor>MCP </Text>
        <Text>{mcp} · {status?.toolCount ?? 0} tools · {skills} skills · {mode}</Text>
      </Box>
      <Box>
        <Text color="green" bold>  ╚╝  ╚╝   </Text>
        <Text dimColor>ReAct · Plan · MCP · Browser · Image · Tools · Memory · RAG</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>Tips for getting started:</Text>
        <Text>1. Type / for commands and Tab completion</Text>
        <Text>2. Ask coding questions, edit code or run commands</Text>
        <Text>3. Attach context with @path or @image</Text>
      </Box>
    </Box>
  )
}

function PromptLine({ value, active }: { value: string; active: boolean }): React.ReactElement {
  const content = value || (active ? '' : 'processing...')
  return (
    <Box paddingX={1} height={1}>
      <Text color="magenta">{'>'} </Text>
      <Text>{active ? content : <Text dimColor>{content}</Text>}</Text>
      {active ? <Text color="cyan">█</Text> : null}
    </Box>
  )
}

function Footer({ status, columns }: { status: StatusInfo | null; columns: number }): React.ReactElement {
  const width = Math.max(40, Math.min(columns, 160))
  if (!status) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{'─'.repeat(width)}</Text>
        <Text wrap="truncate-end">Auto Model · unknown idle</Text>
      </Box>
    )
  }

  const provider = status.provider ? ` (${status.provider})` : ''
  const contextPercent = getContextPercent(status)
  const ctx = `${contextPercent}% (${formatCompact(status.tokensUsed)}/${formatCompact(status.tokenLimit)})`
  const hitl = status.hitlMode ?? 'auto'
  const firstLeft = 'YOLO Ctrl+Y to enable HITL'
  const firstRight = `${status.loadedSkills ?? 0} skills · ${status.connectedMcpServers ?? 0} MCP servers`
  const firstGap = Math.max(1, width - firstLeft.length - firstRight.length)
  const firstLine = `${firstLeft}${' '.repeat(firstGap)}${firstRight}`
  const secondLine = buildFooterLine(status, provider, ctx, hitl, width)

  return (
    <Box flexDirection="column">
      <Text dimColor>{'─'.repeat(width)}</Text>
      <Text color="yellow" wrap="truncate-end">{truncateEnd(firstLine, width)}</Text>
      <Text wrap="truncate-end">{truncateEnd(secondLine, width)}</Text>
    </Box>
  )
}

function buildFooterLine(status: StatusInfo, provider: string, ctx: string, hitl: string, width: number): string {
  const model = width >= 100 ? `${status.model}${provider}` : status.model
  const parts = [
    'Auto Model',
    model,
    status.statusText ?? 'idle',
    `ctx ${ctx}`,
    `turns ${status.conversationTurns ?? 0}`,
    `hitl ${hitl}`,
  ]
  if (width >= 95) {
    parts.push(status.memoryEnabled ? 'mem' : 'mem off')
  }

  const baseLine = parts.join(' · ')
  if (width < 100 || !status.cwd) return baseLine

  const remainingForPath = width - baseLine.length - 3
  if (remainingForPath < 16) return baseLine
  return `${baseLine} · ${compactPath(status.cwd, remainingForPath)}`
}

function capItems(items: TranscriptItem[]): TranscriptItem[] {
  return items.length > 200 ? items.slice(-200) : items
}

function summarizeToolInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value.slice(0, 40) : JSON.stringify(value)}`)
    .join(', ')
}

function getContextPercent(status: StatusInfo): number {
  return status.tokenLimit > 0
    ? Math.min(100, Math.round((status.tokensUsed / status.tokenLimit) * 100))
    : 0
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`
  return String(value)
}

function truncateEnd(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 1) return '…'
  return `${value.slice(0, maxLength - 1)}…`
}

function compactPath(path: string, maxLength = 48): string {
  const home = process.env.HOME
  const normalized = home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
  if (normalized.length <= maxLength) return normalized
  return `…${normalized.slice(-(maxLength - 1))}`
}
