/**
 * Ink Spinner 组件
 */
import React, { useState, useEffect } from 'react'
import { Text } from 'ink'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface SpinnerProps {
  label?: string
}

export function Spinner({ label }: SpinnerProps): React.ReactElement {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 80)
    return () => clearInterval(timer)
  }, [])

  return <Text color="cyan">{FRAMES[frame]} {label ?? 'Processing...'}</Text>
}
