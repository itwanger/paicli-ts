/**
 * 状态栏组件
 */
import React from 'react'
import { Box, Text } from 'ink'
import type { StatusInfo } from '../Renderer.js'

interface StatusBarProps {
  status: StatusInfo
}

export function StatusBar({ status }: StatusBarProps): React.ReactElement {
  const tokenPercent = status.tokenLimit > 0
    ? Math.round((status.tokensUsed / status.tokenLimit) * 100)
    : 0

  return (
    <Box paddingX={1} borderStyle="single" borderColor="gray">
      <Text color="green" bold>π</Text>
      <Text> </Text>
      <Text color="cyan">{status.model}</Text>
      <Text> │ </Text>
      <Text color={tokenPercent > 80 ? 'red' : 'yellow'}>
        {status.tokensUsed.toLocaleString()} tokens ({tokenPercent}%)
      </Text>
      <Text> │ </Text>
      <Text color="magenta">{status.agentMode}</Text>
      {status.statusText && (
        <>
          <Text> │ </Text>
          <Text color="gray">{status.statusText}</Text>
        </>
      )}
    </Box>
  )
}
