/**
 * 推理面板组件
 */
import React from 'react'
import { Box, Text } from 'ink'

interface ThinkingPanelProps {
  content: string
  visible?: boolean
}

export function ThinkingPanel({ content, visible = true }: ThinkingPanelProps): React.ReactElement | null {
  if (!visible || !content) return null

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="blue" paddingX={1}>
      <Text color="blue" bold>💭 Thinking</Text>
      <Text color="blue" dimColor wrap="wrap">
        {content.slice(0, 300)}{content.length > 300 ? '...' : ''}
      </Text>
    </Box>
  )
}
