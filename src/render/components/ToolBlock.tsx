/**
 * 工具调用块组件
 */
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

interface ToolBlockProps {
  name: string
  input: Record<string, unknown>
  result?: string
  isError?: boolean
  collapsed?: boolean
}

export function ToolBlock({ name, input, result, isError, collapsed = true }: ToolBlockProps): React.ReactElement {
  const [expanded, setExpanded] = useState(!collapsed)

  useInput((_, key) => {
    if (key.ctrl && _.toLowerCase() === 'o') {
      setExpanded((e) => !e)
    }
  })

  const summary = Object.entries(input)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 30) : '...'}`)
    .join(', ')

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={isError ? 'red' : 'gray'} paddingX={1}>
      <Box>
        <Text color="yellow">⚡ {name}</Text>
        <Text color="gray"> ({summary})</Text>
        {expanded && <Text color="gray"> [ctrl+o]</Text>}
      </Box>
      {expanded && (
        <Box flexDirection="column">
          <Text color="gray" dimColor>Input: {JSON.stringify(input, null, 2)}</Text>
          {result && (
            <Text color={isError ? 'red' : 'gray'} dimColor>
              {result.slice(0, 500)}{result.length > 500 ? '...' : ''}
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}
