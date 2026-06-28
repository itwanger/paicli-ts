/**
 * MCP 连接抽象 — stdio/HTTP transport
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface, type Interface } from 'node:readline'

export interface McpConnection {
  /** 连接 */
  connect(): Promise<void>
  /** 断开 */
  disconnect(): Promise<void>
  /** 发送请求 */
  sendRequest(method: string, params: Record<string, unknown>): Promise<unknown>
  /** 是否已连接 */
  isConnected(): boolean
}

/** stdio 传输 */
export class StdioMcpConnection implements McpConnection {
  private connected = false
  private command: string
  private args: string[]
  private env?: Record<string, string>
  private child: ChildProcessWithoutNullStreams | null = null
  private rl: Interface | null = null
  private nextId = 1
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>()

  constructor(command: string, args: string[] = [], env?: Record<string, string>) {
    this.command = command
    this.args = args
    this.env = env
  }

  async connect(): Promise<void> {
    if (this.connected) return
    this.child = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.rl = createInterface({ input: this.child.stdout })
    this.rl.on('line', (line) => this.handleLine(line))
    this.child.once('exit', () => {
      this.connected = false
      for (const pending of this.pending.values()) {
        pending.reject(new Error('MCP stdio process exited'))
      }
      this.pending.clear()
    })
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.rl?.close()
    this.rl = null
    this.child?.kill()
    this.child = null
    this.pending.clear()
  }

  async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.connected || !this.child) {
      throw new Error('MCP stdio connection is not connected')
    }
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child!.stdin.write(payload + '\n', (err) => {
        if (err) {
          this.pending.delete(id)
          reject(err)
        }
      })
    })
  }
  isConnected(): boolean { return this.connected }

  private handleLine(line: string): void {
    let response: { id?: number; result?: unknown; error?: unknown }
    try {
      response = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown }
    } catch {
      return
    }
    if (typeof response.id !== 'number') return
    const pending = this.pending.get(response.id)
    if (!pending) return
    this.pending.delete(response.id)
    if (response.error) pending.reject(new Error(JSON.stringify(response.error)))
    else pending.resolve(response.result)
  }
}

/** HTTP 传输 */
export class HttpMcpConnection implements McpConnection {
  private connected = false
  private url: string

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<void> { this.connected = true }
  async disconnect(): Promise<void> { this.connected = false }
  async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.connected) {
      throw new Error('MCP HTTP connection is not connected')
    }
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    })
    if (!response.ok) {
      throw new Error(`MCP HTTP error ${response.status}: ${await response.text()}`)
    }
    const payload = await response.json() as { result?: unknown; error?: unknown }
    if (payload.error) throw new Error(JSON.stringify(payload.error))
    return payload.result
  }
  isConnected(): boolean { return this.connected }
}
