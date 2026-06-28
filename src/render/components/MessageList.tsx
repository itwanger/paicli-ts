/**
 * 消息列表组件
 */
import React from 'react'
import { Box, Text } from 'ink'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp?: number
}

interface MessageListProps {
  messages: ChatMessage[]
}

export function MessageList({ messages }: MessageListProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        <Box key={i} flexDirection="column" marginBottom={1}>
          {msg.role === 'user' && <Text color="green" bold>You: {msg.content}</Text>}
          {msg.role === 'assistant' && <Text>{msg.content}</Text>}
          {msg.role === 'tool' && <Text color="gray" dimColor>[{msg.content}]</Text>}
        </Box>
      ))}
    </Box>
  )
}
