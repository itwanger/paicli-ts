import React from 'react'
import { Box, Text } from 'ink'

type MarkdownBlock =
  | { type: 'blank' }
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; marker: string; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string; lines: string[] }
  | { type: 'rule' }

type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; url: string }

interface MarkdownTextProps {
  text: string
  dimColor?: boolean
  maxLines?: number
}

export function MarkdownText({ text, dimColor = false, maxLines }: MarkdownTextProps): React.ReactElement {
  const blocks = parseMarkdownBlocks(limitLines(text, maxLines))

  return (
    <Box flexDirection="column">
      {blocks.map((block, index) => <MarkdownBlockView key={index} block={block} dimColor={dimColor} />)}
    </Box>
  )
}

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

function MarkdownBlockView({ block, dimColor }: { block: MarkdownBlock; dimColor: boolean }): React.ReactElement | null {
  if (block.type === 'blank') return <Box height={1} />

  if (block.type === 'heading') {
    const color = block.level <= 2 ? 'cyan' : 'green'
    return (
      <Box marginTop={block.level <= 2 ? 1 : 0}>
        <Text color={color} bold>
          {block.level <= 2 ? '▌ ' : ''}
          <InlineMarkdown text={block.text} />
        </Text>
      </Box>
    )
  }

  if (block.type === 'list') {
    return (
      <Box>
        <Text dimColor>{block.marker.padEnd(3, ' ')}</Text>
        <Text dimColor={dimColor} wrap="wrap"><InlineMarkdown text={block.text} /></Text>
      </Box>
    )
  }

  if (block.type === 'quote') {
    return (
      <Box>
        <Text dimColor>│ </Text>
        <Text dimColor wrap="wrap"><InlineMarkdown text={block.text} /></Text>
      </Box>
    )
  }

  if (block.type === 'code') {
    return (
      <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginY={1}>
        {block.language ? <Text dimColor>{block.language}</Text> : null}
        {block.lines.length > 0
          ? block.lines.map((line, index) => <Text key={index} color="gray">{line || ' '}</Text>)
          : <Text color="gray"> </Text>}
      </Box>
    )
  }

  if (block.type === 'rule') {
    return <Text dimColor>{'─'.repeat(60)}</Text>
  }

  return (
    <Text dimColor={dimColor} wrap="wrap">
      <InlineMarkdown text={block.text} />
    </Text>
  )
}

function InlineMarkdown({ text }: { text: string }): React.ReactElement {
  return (
    <>
      {parseInlineMarkdown(text).map((token, index) => {
        if (token.type === 'bold') return <Text key={index} bold>{token.text}</Text>
        if (token.type === 'code') return <Text key={index} color="yellow">{token.text}</Text>
        if (token.type === 'link') {
          return (
            <Text key={index}>
              <Text color="cyan">{token.label}</Text>
              <Text dimColor> ({token.url})</Text>
            </Text>
          )
        }
        return <Text key={index}>{token.text}</Text>
      })}
    </>
  )
}

function limitLines(text: string, maxLines?: number): string {
  if (!maxLines || maxLines <= 0) return text
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return `${lines.slice(0, maxLines).join('\n')}\n...`
}

function trimEdgeBlankBlocks(blocks: MarkdownBlock[]): MarkdownBlock[] {
  let start = 0
  let end = blocks.length
  while (start < end && blocks[start].type === 'blank') start++
  while (end > start && blocks[end - 1].type === 'blank') end--
  return blocks.slice(start, end)
}
