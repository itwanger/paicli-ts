/**
 * SSE (Server-Sent Events) 流式解析器
 * 支持 HTTP/1.1 chunked transfer 和标准 SSE 格式
 */

/** SSE 事件 */
export interface SseEvent {
  /** 事件类型 */
  event?: string
  /** 数据内容 */
  data: string
  /** 事件 ID */
  id?: string
  /** 重试间隔 */
  retry?: number
}

/**
 * 从 ReadableStream 解析 SSE 事件
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buffer = ''

  try {
    while (true) {
      if (abortSignal?.aborted) break

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 按双换行分割事件
      const parts = buffer.split('\n\n')
      // 最后一个可能不完整，保留在 buffer
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const event = parseSseEvent(part)
        if (event) yield event
      }
    }

    // 处理 buffer 中剩余内容
    if (buffer.trim()) {
      const event = parseSseEvent(buffer)
      if (event) yield event
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * 解析单个 SSE 事件
 */
function parseSseEvent(raw: string): SseEvent | null {
  const lines = raw.split('\n')
  const event: Partial<SseEvent> = {}
  let dataParts: string[] = []

  for (const line of lines) {
    if (line.startsWith(':')) continue // 注释行

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) {
      // 只有字段名，无值
      if (line === 'data') {
        dataParts.push('')
      }
      continue
    }

    const field = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()

    switch (field) {
      case 'event':
        event.event = value
        break
      case 'data':
        dataParts.push(value)
        break
      case 'id':
        event.id = value
        break
      case 'retry':
        event.retry = parseInt(value, 10)
        break
    }
  }

  if (dataParts.length === 0) return null

  return {
    event: event.event,
    data: dataParts.join('\n'),
    id: event.id,
    retry: event.retry,
  }
}

/**
 * 从 Node.js Readable 流解析 SSE（兼容 Node 原生流）
 */
export async function* parseNodeSseStream(
  stream: AsyncIterable<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of stream) {
    if (abortSignal?.aborted) break

    buffer += decoder.decode(chunk, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const event = parseSseEvent(part)
      if (event) yield event
    }
  }

  if (buffer.trim()) {
    const event = parseSseEvent(buffer)
    if (event) yield event
  }
}

/**
 * OpenAI 兼容格式 SSE 解析
 * 将 data: [DONE] 转换为结束信号
 */
export async function* parseOpenAiSse(
  stream: AsyncIterable<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<Record<string, unknown>> {
  for await (const event of parseNodeSseStream(stream, abortSignal)) {
    if (event.data === '[DONE]') return
    try {
      yield JSON.parse(event.data) as Record<string, unknown>
    } catch {
      // 跳过无法解析的事件
    }
  }
}
