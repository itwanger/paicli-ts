/**
 * HITL 审批提示组件
 */
import React from 'react'
import { Box, Text, useInput } from 'ink'
import type { ApprovalRequest } from '../Renderer.js'

interface PermissionPromptProps {
  request: ApprovalRequest
  onDecision: (decision: 'approve' | 'deny' | 'approve_all' | 'skip') => void
}

export function PermissionPrompt({ request, onDecision }: PermissionPromptProps): React.ReactElement {
  useInput((input) => {
    switch (input.toLowerCase()) {
      case 'y': onDecision('approve'); break
      case 'n': onDecision('deny'); break
      case 'a': onDecision('approve_all'); break
      case 's': onDecision('skip'); break
    }
  })

  return (
    <Box flexDirection="column" borderStyle="double" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>⚠️  Permission Required</Text>
      <Text>Tool: <Text color="cyan">{request.toolName}</Text></Text>
      <Text>Level: <Text color={request.dangerLevel === 'high' ? 'red' : 'yellow'}>{request.dangerLevel}</Text></Text>
      <Text dimColor>{request.description}</Text>
      <Box marginTop={1}>
        <Text color="green">[y]</Text><Text>es </Text>
        <Text color="red">[n]</Text><Text>o </Text>
        <Text color="cyan">[a]</Text><Text>ll </Text>
        <Text color="gray">[s]</Text><Text>kip</Text>
      </Box>
    </Box>
  )
}
