import { useEffect, useState } from 'react'
import { getStoredText, setStoredText } from '../lib/session-storage/text'

export function usePersistentTextState(
  key: string,
  fallback = ''
): [string, React.Dispatch<React.SetStateAction<string>>] {
  const [value, setValue] = useState(() => getStoredText(key, fallback))

  useEffect(() => {
    setStoredText(key, value)
  }, [key, value])

  return [value, setValue]
}
