export type MarkdownBlock =
  | { type: 'blank' }
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; marker: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string; lines: string[] }
  | { type: 'rule' }

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; url: string }

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let inCode = false
  let codeLanguage = ''
  let codeLines: string[] = []

  for (const line of lines) {
    const fence = line.match(/^```([\w-]*)\s*$/)
    if (fence) {
      if (inCode) {
        blocks.push({ type: 'code', language: codeLanguage, lines: codeLines })
        codeLanguage = ''
        codeLines = []
        inCode = false
      } else {
        codeLanguage = fence[1] ?? ''
        codeLines = []
        inCode = true
      }
      continue
    }

    if (inCode) {
      codeLines.push(line)
      continue
    }

    if (line.trim() === '') {
      blocks.push({ type: 'blank' })
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }

    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: 'rule' })
      continue
    }

    const unordered = line.match(/^(\s*)[-*+]\s+(.+)$/)
    if (unordered) {
      blocks.push({ type: 'list', marker: '•', text: unordered[2] })
      continue
    }

    const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/)
    if (ordered) {
      blocks.push({ type: 'list', marker: `${ordered[2]}.`, text: ordered[3] })
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      blocks.push({ type: 'quote', text: quote[1] })
      continue
    }

    blocks.push({ type: 'paragraph', text: line })
  }

  if (inCode) {
    blocks.push({ type: 'code', language: codeLanguage, lines: codeLines })
  }

  return trimEdgeBlankBlocks(blocks)
}

export function parseInlineMarkdown(text: string): InlineToken[] {
  const tokens: InlineToken[] = []
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+?\*\*|\[[^\]\n]+?\]\([^) \n]+?\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }

    const raw = match[0]
    if (raw.startsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) })
    } else if (raw.startsWith('**')) {
      tokens.push({ type: 'bold', text: raw.slice(2, -2) })
    } else {
      const link = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (link) tokens.push({ type: 'link', label: link[1], url: link[2] })
      else tokens.push({ type: 'text', text: raw })
    }

    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', text }]
}

function trimEdgeBlankBlocks(blocks: MarkdownBlock[]): MarkdownBlock[] {
  let start = 0
  let end = blocks.length
  while (start < end && blocks[start].type === 'blank') start++
  while (end > start && blocks[end - 1].type === 'blank') end--
  return blocks.slice(start, end)
}
