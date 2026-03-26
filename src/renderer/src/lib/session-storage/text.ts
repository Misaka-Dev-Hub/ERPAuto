export function getStoredText(key: string, fallback = ''): string {
  const stored = sessionStorage.getItem(key)
  return stored ?? fallback
}

export function setStoredText(key: string, value: string): void {
  sessionStorage.setItem(key, value)
}
