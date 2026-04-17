import React from 'react'

/**
 * Highlight matching text with a <mark> tag
 * Case-insensitive matching of the query within text
 */
export function highlightText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()

  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) return text

  const before = text.substring(0, index)
  const match = text.substring(index, index + query.length)
  const after = text.substring(index + query.length)

  return (
    <>
      {before}
      <mark className="bg-yellow-200 text-inherit rounded px-0.5">{match}</mark>
      {highlightText(after, query)}
    </>
  )
}
