import type { Interface as ReadlineInterface } from 'node:readline'

/**
 * Persistent line reader for fallback renderers.
 *
 * Reusing a single readline interface keeps already-buffered pipe input intact
 * across multiple REPL turns.
 */
export class LineReader {
  private readline: ReadlineInterface | null = null
  private lineIterator: AsyncIterator<string> | null = null

  constructor(
    private readonly input: NodeJS.ReadableStream,
    private readonly output: NodeJS.WritableStream,
    private readonly terminal: boolean,
  ) {}

  async read(prompt: string): Promise<string> {
    if (!this.readline || !this.lineIterator) {
      const readline = await import('node:readline')
      this.readline = readline.createInterface({
        input: this.input,
        output: this.output,
        terminal: this.terminal,
      })
      this.lineIterator = this.readline[Symbol.asyncIterator]()
    }
    this.output.write(prompt)
    const next = await this.lineIterator.next()
    return next.done ? '/exit' : next.value
  }

  close(): void {
    this.readline?.close()
    this.readline = null
    this.lineIterator = null
  }
}
