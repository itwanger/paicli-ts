/**
 * Diff 展示组件
 */
import React from 'react'
import { Box, Text } from 'ink'

interface DiffViewProps {
  oldContent?: string
  newContent?: string
  filePath?: string
}

export function DiffView({ oldContent, newContent, filePath }: DiffViewProps): React.ReactElement {
  return (
    <Box flexDirection="column" borderStyle="single" borderColor="green" paddingX={1}>
      {filePath && <Text color="cyan" bold>{filePath}</Text>}
      {oldContent && (
        <Text color="red" dimColor>
          {oldContent.split('\n').slice(0, 10).map((l) => `- ${l}`).join('\n')}
        </Text>
      )}
      {newContent && (
        <Text color="green">
          {newContent.split('\n').slice(0, 10).map((l) => `+ ${l}`).join('\n')}
        </Text>
      )}
    </Box>
  )
}
