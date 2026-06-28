import React from 'react'
import { Box, Text } from 'ink'
import { parseInlineMarkdown, parseMarkdownBlocks, type MarkdownBlock } from './MarkdownParser.js'

export { parseInlineMarkdown, parseMarkdownBlocks } from './MarkdownParser.js'

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
