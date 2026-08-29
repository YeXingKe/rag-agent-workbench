import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-3 text-base font-bold tracking-tight text-ink first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-[15px] font-bold tracking-tight text-ink first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2.5 text-sm font-semibold text-ink first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 text-sm leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 text-sm leading-relaxed last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="marker:text-ink-muted">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic text-ink-soft">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
    >
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = Boolean(className)
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-lg bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
          {children}
        </code>
      )
    }
    return (
      <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[12px] text-accent-deep">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-xl border border-line bg-paper p-0 last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-accent/40 pl-3 text-ink-soft last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line px-2 py-1.5 font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border-b border-line/70 px-2 py-1.5 text-ink-soft">{children}</td>
  ),
}

interface MarkdownContentProps {
  content: string
  className?: string
}

/**
 * 将助手回复按 Markdown 渲染（标题、列表、加粗、代码块、引用编号等）。
 */
export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  if (!content.trim()) {
    return null
  }

  // 把 [1]、[2] 这类引用编号加粗，方便对照来源切片
  const normalized = content.replace(/\[(\d+)\]/g, '**[$1]**')

  return (
    <div className={`markdown-body text-ink ${className}`}>
      <ReactMarkdown components={markdownComponents}>{normalized}</ReactMarkdown>
    </div>
  )
}
