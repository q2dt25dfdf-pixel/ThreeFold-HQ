'use client'

import { useEffect, useRef, useState } from 'react'

type AllowedTag = 'h1' | 'h2' | 'h3' | 'p' | 'span'

interface Props {
  value: string
  onSave: (value: string) => void
  as?: AllowedTag
  className?: string
  placeholder?: string
}

/**
 * Renders a heading/text element that becomes an inline input on click.
 *
 * - Enter or blur → save (only if value actually changed and non-empty)
 * - Escape         → cancel (revert draft)
 * - Hover shows a faint pencil icon to hint editability
 */
export default function InlineEditTitle({
  value,
  onSave,
  as: Tag = 'h1',
  className = '',
  placeholder,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep draft in sync when parent value changes while not actively editing
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  // Auto-focus and select-all when edit mode opens
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    } else {
      setDraft(value) // revert draft if empty or unchanged
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        placeholder={placeholder ?? value}
        className={className}
        style={{
          background: 'transparent',
          border: 'none',
          outline: '2px solid rgba(148,163,184,0.45)',
          outlineOffset: '4px',
          borderRadius: '4px',
          width: '100%',
          display: 'block',
          padding: '0 2px',
          margin: '0 -2px',
        }}
      />
    )
  }

  return (
    <Tag
      className={`${className} group/iet cursor-text`}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value}
      {/* Faint pencil icon — visible only on hover */}
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="ml-2 inline-block h-3 w-3 shrink-0 align-middle opacity-0 transition-opacity group-hover/iet:opacity-40"
        aria-hidden="true"
      >
        <path
          d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Tag>
  )
}
