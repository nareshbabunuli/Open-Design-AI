import React from "react"

interface FormattedMessageTextProps {
  text: string
  isUser?: boolean
  className?: string
}

function parseInlineMarkdown(text: string, isUser = false): React.ReactNode[] {
  if (!text) return []

  // Tokenize bold-italic, bold, inline-code, links, and italic
  const tokenRegex = /(\*\*\*[\s\S]+?\*\*\*|\*\*[\s\S]+?\*\*|`[^`]+`|\[[^\n\]]+\]\(https?:\/\/[^\s\)]+\)|\*[^*\n]+?\*)/g
  const parts = text.split(tokenRegex)

  return parts.map((part, index) => {
    if (!part) return null

    // Bold + Italic: ***text***
    if (part.startsWith("***") && part.endsWith("***") && part.length >= 6) {
      return (
        <strong key={index} className="font-semibold italic text-white">
          {part.slice(3, -3)}
        </strong>
      )
    }

    // Bold: **text**
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      )
    }

    // Inline Code: `text`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={index}
          className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
            isUser
              ? "bg-indigo-700/80 text-white"
              : "bg-slate-800 text-indigo-300 border border-slate-700/60"
          }`}
        >
          {part.slice(1, -1)}
        </code>
      )
    }

    // Link: [label](url)
    const linkMatch = part.match(/^\[([^\n\]]+)\]\((https?:\/\/[^\s\)]+)\)$/)
    if (linkMatch) {
      return (
        <a
          key={index}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 ${
            isUser ? "text-white hover:text-indigo-200" : "text-indigo-400 hover:text-indigo-300"
          }`}
        >
          {linkMatch[1]}
        </a>
      )
    }

    // Italic: *text*
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={index} className={`italic ${isUser ? "text-indigo-100" : "text-slate-300"}`}>
          {part.slice(1, -1)}
        </em>
      )
    }

    return <span key={index}>{part}</span>
  })
}

export function FormattedMessageText({ text, isUser = false, className = "" }: FormattedMessageTextProps) {
  if (!text) return null

  const lines = text.split("\n")

  return (
    <div className={`space-y-1 break-words ${className}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />
        }

        // Detect bullet / numbered list item: •, -, *, or 1.
        const bulletMatch = trimmed.match(/^([•\-\*]|\d+\.)\s+(.+)$/)
        if (bulletMatch) {
          const prefix = bulletMatch[1]
          const rest = bulletMatch[2]
          const isNumeric = /^\d+\.$/.test(prefix)

          return (
            <div key={idx} className="flex items-start gap-1.5 pl-0.5">
              <span
                className={`select-none shrink-0 ${
                  isNumeric
                    ? "font-mono text-[10px] text-slate-400 min-w-[14px] pt-0.5"
                    : isUser
                    ? "text-indigo-200 font-bold"
                    : "text-indigo-400 font-bold"
                }`}
              >
                {isNumeric ? prefix : "•"}
              </span>
              <span className="flex-1 leading-relaxed">
                {parseInlineMarkdown(rest, isUser)}
              </span>
            </div>
          )
        }

        return (
          <p key={idx} className="leading-relaxed">
            {parseInlineMarkdown(line, isUser)}
          </p>
        )
      })}
    </div>
  )
}

export default FormattedMessageText
