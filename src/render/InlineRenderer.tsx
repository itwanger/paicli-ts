/**
 * Append-only terminal renderer for interactive sessions.
 *
 * Completed transcript blocks are written once to the terminal scrollback.
 * Only the prompt/footer area is transient, so scrolling back shows previous
 * turns instead of Ink repaint frames.
 */
import type { Renderer, StatusInfo, ApprovalRequest, ApprovalResult } from './Renderer.js'
import type { StreamEvent } from '../llm/types.js'
import type { ToolResult } from '../types/tool.js'
import { LineReader } from './LineReader.js'
import { parseInlineMarkdown, parseMarkdownBlocks } from './MarkdownParser.js'

type LiveKind = 'assistant' | 'thinking' | null

interface PromptKey {
  return?: boolean
  backspace?: boolean
  delete?: boolean
  ctrl?: boolean
  meta?: boolean
}

interface PromptInputUpdate {
  value: string
  submit?: string
}

/**
 * InlineRenderer falls back to legacy console output when it is used without
 * start(), in tests, or in piped/non-TTY mode.
 */
export class InlineRenderer implements Renderer {
  readonly mode = 'inline' as const
  private status: StatusInfo | null = null
  private version = ''
  private tuiActive = false
  private inputActive = false
  private inputValue = ''
  private queuedInput = ''
  private pendingResolve: ((value: string) => void) | null = null
  private legacyLineReader: LineReader | null = null
  private transientRows = 0
  private transientPromptOffset = 0
  private liveKind: LiveKind = null
  private liveText = ''
  private readonly inputHandler = (chunk: Buffer) => this.handleInputData(chunk)

  async start(): Promise<void> {
    if (!this.canUseTui()) return
    this.tuiActive = true
    process.stdin.setRawMode?.(true)
    process.stdin.resume()
    process.stdin.on('data', this.inputHandler)
    process.stdout.write('\x1B[?25h')
  }

  async stop(): Promise<void> {
    this.legacyLineReader?.close()
    this.legacyLineReader = null

    if (this.tuiActive) {
      this.flushLiveBlock()
      this.clearTransient()
      process.stdin.off('data', this.inputHandler)
      process.stdin.setRawMode?.(false)
      process.stdin.pause()
      process.stdout.write('\x1B[?25h')
    }

    this.tuiActive = false
  }

  showWelcome(version: string): void {
    this.version = version
    if (!this.tuiActive) {
      this.renderLegacyWelcome(version)
      return
    }
    this.writeHistoryBlock(renderWelcomePanel(version, this.status))
  }

  showPrompt(): void {
    if (!this.tuiActive) {
      if (this.status) this.renderLegacyStatusBar(this.status)
      return
    }
    this.redrawTransient()
  }

  beginThinking(): void {
    if (!this.tuiActive) {
      process.stdout.write('\x1b[34mThinking...\x1b[0m')
      return
    }
    this.flushLiveBlock()
    this.liveKind = 'thinking'
    this.liveText = ''
    this.redrawTransient()
  }

  appendThinking(text: string): void {
    if (!this.tuiActive) return
    if (this.liveKind !== 'thinking') this.beginThinking()
    this.liveText += text
    this.redrawTransient()
  }

  endThinking(): void {
    if (!this.tuiActive) {
      process.stdout.write('\r\x1b[K')
      return
    }
    this.flushLiveBlock()
  }

  beginText(): void {
    if (!this.tuiActive) return
    this.flushLiveBlock()
    this.liveKind = 'assistant'
    this.liveText = ''
    this.redrawTransient()
  }

  appendText(text: string): void {
    if (!this.tuiActive) {
      process.stdout.write(text)
      return
    }
    if (this.liveKind !== 'assistant') {
      this.flushLiveBlock()
      this.liveKind = 'assistant'
      this.liveText = ''
    }
    this.liveText += text
    this.redrawTransient()
  }

  endText(): void {
    if (!this.tuiActive) {
      process.stdout.write('\n')
      return
    }
    this.flushLiveBlock()
  }

  showToolCall(name: string, input: Record<string, unknown>): void {
    const summary = summarizeToolInput(input)
    if (!this.tuiActive) {
      process.stdout.write(`\x1b[33m> ${name}\x1b[0m(${summary})\n`)
      return
    }
    this.flushLiveBlock()
    this.writeHistoryBlock(renderToolCall(name, summary))
  }

  showToolResult(result: ToolResult): void {
    const title = result.displaySummary ?? (result.isError ? 'Tool error' : 'Tool result')
    if (!this.tuiActive) {
      if (result.isError) process.stderr.write(`\x1b[31merror\x1b[0m ${result.content}\n`)
      else process.stdout.write(`\x1b[36mdone\x1b[0m ${result.content}\n`)
      return
    }
    this.flushLiveBlock()
    this.writeHistoryBlock(renderToolResult(title, result.content, Boolean(result.isError)))
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
    if (!this.tuiActive) {
      process.stderr.write(`\x1b[31mError: ${error.message}\x1b[0m\n`)
      return
    }
    this.flushLiveBlock()
    this.writeHistoryBlock(`${red(`Error: ${error.message}`)}\n`)
  }

  showOutput(text: string): void {
    if (!this.tuiActive) {
      process.stdout.write(`${text}\n`)
      return
    }
    this.flushLiveBlock()
    this.writeHistoryBlock(`${green(renderMarkdownAnsi(text))}\n`)
  }

  showStatus(status: StatusInfo): void {
    this.status = status
    if (this.tuiActive) this.redrawTransient()
  }

  async requestApproval(_request: ApprovalRequest): Promise<ApprovalResult> {
    return { decision: 'approve' }
  }

  async readInput(): Promise<string> {
    if (!this.tuiActive) {
      return this.readLegacyInput('\x1b[35m>\x1b[0m ')
    }

    return new Promise((resolve) => {
      this.pendingResolve = resolve
      this.inputActive = true
      this.inputValue = ''
      this.redrawTransient()
      if (this.queuedInput) {
        const queued = this.queuedInput
        this.queuedInput = ''
        this.handleInputText(queued)
      }
    })
  }

  clear(): void {
    if (!this.tuiActive) {
      process.stdout.write('\x1B[2J\x1B[3J\x1B[H')
      return
    }
    this.flushLiveBlock()
    this.clearTransient()
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H')
    this.redrawTransient()
  }

  private submitInput(rawValue: string): void {
    const resolve = this.pendingResolve
    if (!resolve) return

    this.pendingResolve = null
    this.inputActive = false
    this.inputValue = ''
    const value = rawValue.trim()

    if (value) {
      this.writeHistoryBlock(renderUserInput(value))
    } else {
      this.redrawTransient()
    }

    resolve(value)
  }

  private flushLiveBlock(): void {
    if (!this.liveKind || !this.liveText.trim()) {
      this.liveKind = null
      this.liveText = ''
      return
    }

    const text = this.liveText
    const kind = this.liveKind
    this.liveKind = null
    this.liveText = ''

    if (kind === 'thinking') {
      this.writeHistoryBlock(renderThinking(text))
    } else {
      this.writeHistoryBlock(renderAssistant(text))
    }
  }

  private writeHistoryBlock(text: string): void {
    this.clearTransient()
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
    this.redrawTransient()
  }

  private redrawTransient(): void {
    if (!this.tuiActive) return
    this.clearTransient()
    this.drawTransient()
  }

  private drawTransient(): void {
    if (!this.tuiActive) return

    const columns = getColumns()
    const previewLines = renderLivePreview(this.liveKind, this.liveText, columns)
    const prompt = buildPromptLine(this.inputValue, this.inputActive, columns)
    const footer = buildFooterLines(this.status, columns)
    const lines = [
      ...previewLines,
      prompt.line,
      dim('─'.repeat(columns)),
      footer.first,
      footer.second,
    ]

    process.stdout.write(lines.join('\n'))
    this.transientRows = lines.length
    this.transientPromptOffset = previewLines.length
    process.stdout.write(`\x1B[3F\r${prompt.cursorColumn > 1 ? `\x1B[${prompt.cursorColumn - 1}C` : ''}\x1B[?25h`)
  }

  private clearTransient(): void {
    if (!this.tuiActive || this.transientRows === 0) return
    if (this.transientPromptOffset > 0) {
      process.stdout.write(`\x1B[${this.transientPromptOffset}F`)
    }
    process.stdout.write('\r\x1B[J')
    this.transientRows = 0
    this.transientPromptOffset = 0
  }

  private handleInputData(chunk: Buffer): void {
    const value = chunk.toString('utf8')
    if (!this.inputActive) {
      this.queuedInput += value
      return
    }
    this.handleInputText(value)
  }

  private handleInputText(value: string): void {
    for (let index = 0; index < value.length; index++) {
      const char = value[index]

      if (char === '\u0003') {
        this.queuedInput = value.slice(index + 1) + this.queuedInput
        this.submitInput('/exit')
        return
      }

      if (char === '\r' || char === '\n') {
        this.queuedInput = value.slice(index + 1) + this.queuedInput
        this.submitInput(this.inputValue)
        return
      }

      const update = applyPromptInput(this.inputValue, char, {})
      this.inputValue = update.value
      this.redrawTransient()
    }
  }

  private canUseTui(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY)
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
    process.stdout.write(renderWelcomePanel(version, this.status))
  }

  private renderLegacyStatusBar(status: StatusInfo): void {
    const columns = getColumns()
    const footer = buildFooterLines(status, columns)
    process.stdout.write(`${dim('─'.repeat(columns))}\n${footer.first}\n${footer.second}\n`)
  }
}

function renderWelcomePanel(version: string, status: StatusInfo | null): string {
  const model = status?.model ?? 'unknown'
  const provider = status?.provider ? ` (${status.provider})` : ''
  const mcp = `${status?.connectedMcpServers ?? 0}/${status?.mcpServers ?? 0}`
  const skills = `${status?.loadedSkills ?? 0}/${status?.skills ?? 0}`
  const mode = status?.agentMode ?? 'ReAct'

  return [
    '',
    `  ${greenBold('██████╗ ')}  ${bold('PaiCLI')} ${green('π')}  ${dim(`v${version}`)}`,
    `  ${greenBold('  ██  ██╗')}  ${dim('Model')} ${model}${provider}`,
    `  ${greenBold('  ██  ██║')}  ${dim('MCP')} ${mcp} · ${dim(`${status?.toolCount ?? 0} tools`)} · ${skills} skills · ${mode}`,
    `  ${greenBold('  ██  ██║')}  ${dim('ReAct · Plan · MCP · Browser · Image · Tools · Memory · RAG')}`,
    `  ${greenBold('  ╚╝  ╚╝')}`,
    '',
    'Tips for getting started:',
    '1. Type / for commands and Tab completion',
    '2. Ask coding questions, edit code or run commands',
    '3. Attach context with @path or @image',
    '',
  ].join('\n')
}

function renderUserInput(value: string): string {
  return `\n${magenta('>')} ${bold(value)}\n`
}

function renderAssistant(text: string): string {
  return `\n${renderMarkdownAnsi(text)}\n`
}

function renderThinking(text: string): string {
  const body = indent(renderMarkdownAnsi(text), '  ')
  return `\n${blue('∴ Thinking')}\n${dim(body)}\n`
}

function renderToolCall(name: string, summary: string): string {
  const detail = summary ? `  ${dim(summary)}` : ''
  return `\n${yellow('⚡ Tool call')} · ${bold(name)}${detail}\n`
}

function renderToolResult(title: string, content: string, isError: boolean): string {
  const heading = isError ? red('✗ Tool error') : cyan('✓ Tool result')
  const body = renderMarkdownAnsi(content.slice(0, 1_600))
  return `\n${heading} · ${dim(title)}\n${dim(body)}\n`
}

function renderMarkdownAnsi(markdown: string): string {
  const lines: string[] = []
  for (const block of parseMarkdownBlocks(markdown)) {
    if (block.type === 'blank') {
      lines.push('')
    } else if (block.type === 'heading') {
      lines.push(greenBold(block.text))
    } else if (block.type === 'list') {
      lines.push(`${dim(block.marker)}  ${renderInlineAnsi(block.text)}`)
    } else if (block.type === 'quote') {
      lines.push(`${dim('│')} ${dim(renderInlineAnsi(block.text))}`)
    } else if (block.type === 'code') {
      if (block.language) lines.push(dim(block.language))
      for (const line of block.lines) lines.push(dim(`  ${line}`))
    } else if (block.type === 'rule') {
      lines.push(dim('─'.repeat(Math.min(getColumns(), 80))))
    } else {
      lines.push(renderInlineAnsi(block.text))
    }
  }
  return lines.join('\n')
}

function renderInlineAnsi(text: string): string {
  return parseInlineMarkdown(text).map((token) => {
    if (token.type === 'bold') return bold(token.text)
    if (token.type === 'code') return yellow(token.text)
    if (token.type === 'link') return `${token.label} ${dim(token.url)}`
    return token.text
  }).join('')
}

function renderLivePreview(kind: LiveKind, text: string, columns: number): string[] {
  if (!kind || !text.trim()) return []
  const title = kind === 'thinking' ? blue('∴ Thinking') : dim('Streaming response')
  const rendered = renderMarkdownAnsi(text)
  const bodyLines = rendered.split('\n').filter((line) => line.length > 0)
  const visibleBody = bodyLines.slice(-Math.max(2, Math.min(8, getRows() - 8)))
  return [
    title,
    ...visibleBody.map((line) => truncateDisplay(line, columns)),
    '',
  ]
}

function buildPromptLine(value: string, active: boolean, columns: number): { line: string; cursorColumn: number } {
  const prefix = `${magenta('>')} `
  const content = active ? value : dim('processing...')
  const line = truncateDisplay(`${prefix}${content}`, columns)
  const cursorColumn = Math.min(columns, 3 + terminalDisplayWidth(value))
  return { line, cursorColumn }
}

function buildFooterLines(status: StatusInfo | null, columns: number): { first: string; second: string } {
  const width = Math.max(40, Math.min(columns, 160))
  if (!status) {
    return {
      first: 'Auto Model · unknown idle',
      second: '',
    }
  }

  const firstLeft = 'YOLO Ctrl+Y to enable HITL'
  const firstRight = `${status.loadedSkills ?? 0} skills · ${status.connectedMcpServers ?? 0} MCP servers`
  const gap = Math.max(1, width - firstLeft.length - firstRight.length)
  const first = `${yellow(firstLeft)}${' '.repeat(gap)}${yellow(firstRight)}`

  const provider = status.provider ? ` (${status.provider})` : ''
  const contextPercent = getContextPercent(status)
  const ctx = `${contextPercent}% (${formatCompact(status.tokensUsed)}/${formatCompact(status.tokenLimit)})`
  const hitl = status.hitlMode ?? 'auto'
  const parts = [
    magenta('Auto Model'),
    `${status.model}${provider}`,
    green(status.statusText ?? 'idle'),
    `ctx ${green(ctx)}`,
    `turns ${status.conversationTurns ?? 0}`,
    `hitl ${hitl}`,
  ]
  if (width >= 95) parts.push(status.memoryEnabled ? 'mem' : 'mem off')
  if (width >= 115 && status.cwd) parts.push(compactPath(status.cwd, 42))

  return {
    first: truncateDisplay(first, width),
    second: truncateDisplay(parts.join(' · '), width),
  }
}

function summarizeToolInput(input: Record<string, unknown>): string {
  return Object.entries(input)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value.slice(0, 50) : JSON.stringify(value)}`)
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

function compactPath(path: string, maxLength = 48): string {
  const home = process.env.HOME
  const normalized = home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
  if (normalized.length <= maxLength) return normalized
  return `…${normalized.slice(-(maxLength - 1))}`
}

function indent(text: string, prefix: string): string {
  return text.split('\n').map((line) => `${prefix}${line}`).join('\n')
}

function getColumns(): number {
  return process.stdout.columns && process.stdout.columns > 40 ? process.stdout.columns : 100
}

function getRows(): number {
  return process.stdout.rows && process.stdout.rows > 8 ? process.stdout.rows : 30
}

export function applyPromptInput(currentValue: string, input: string, key: PromptKey): PromptInputUpdate {
  const lineBreakIndex = input.search(/[\r\n]/)
  if (lineBreakIndex >= 0) {
    return { value: '', submit: `${currentValue}${input.slice(0, lineBreakIndex)}`.trim() }
  }

  if (input === '\u007f' || input === '\b') {
    return { value: Array.from(currentValue).slice(0, -1).join('') }
  }

  if (key.return) {
    return { value: '', submit: currentValue.trim() }
  }

  if (key.backspace || key.delete) {
    return { value: Array.from(currentValue).slice(0, -1).join('') }
  }

  if (input === '\u001b') {
    return { value: currentValue }
  }

  if (input < ' ' && input !== '\t') {
    return { value: currentValue }
  }

  if (!key.ctrl && !key.meta && input) {
    return { value: currentValue + input }
  }

  return { value: currentValue }
}

function truncateDisplay(value: string, maxWidth: number): string {
  const raw = stripAnsi(value)
  if (terminalDisplayWidth(raw) <= maxWidth) return value

  let width = 0
  let result = ''
  for (const char of Array.from(raw)) {
    const charWidth = terminalDisplayWidth(char)
    if (width + charWidth > maxWidth - 1) break
    result += char
    width += charWidth
  }
  return `${result}…`
}

function terminalDisplayWidth(value: string): number {
  let width = 0
  for (const char of Array.from(value)) {
    width += isWideChar(char) ? 2 : 1
  }
  return width
}

function isWideChar(char: string): boolean {
  return /[\u1100-\u115F\u2329\u232A\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(char)
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
}

function bold(value: string): string { return `\x1b[1m${value}\x1b[0m` }
function dim(value: string): string { return `\x1b[90m${value}\x1b[0m` }
function red(value: string): string { return `\x1b[31m${value}\x1b[0m` }
function green(value: string): string { return `\x1b[92m${value}\x1b[0m` }
function greenBold(value: string): string { return `\x1b[92m\x1b[1m${value}\x1b[0m` }
function yellow(value: string): string { return `\x1b[93m${value}\x1b[0m` }
function blue(value: string): string { return `\x1b[34m${value}\x1b[0m` }
function cyan(value: string): string { return `\x1b[36m${value}\x1b[0m` }
function magenta(value: string): string { return `\x1b[38;5;213m${value}\x1b[0m` }
