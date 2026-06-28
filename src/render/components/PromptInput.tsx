/**
 * 输入框组件
 */
import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'

interface PromptInputProps {
  onSubmit: (text: string) => void
  placeholder?: string
  disabled?: boolean
}

export function PromptInput({ onSubmit, placeholder, disabled }: PromptInputProps): React.ReactElement {
  const [value, setValue] = useState('')

  useInput((input, key) => {
    if (disabled) return
    if (key.return && value.trim()) {
      onSubmit(value.trim())
      setValue('')
    } else if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1))
    } else if (!key.ctrl && !key.meta) {
      setValue((v) => v + input)
    }
  })

  return (
    <Box>
      <Text color="green" bold>π </Text>
      <Text>{value || (disabled ? '...' : (placeholder ?? 'Type a message...'))}</Text>
    </Box>
  )
}
