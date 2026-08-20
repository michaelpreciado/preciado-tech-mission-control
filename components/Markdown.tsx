'use client'

/**
 * Markdown renderer — token tree from lib/markdown.ts to React elements.
 *
 * SECURITY: there is deliberately no `dangerouslySetInnerHTML` in this file.
 * Agent output is untrusted text; every node below becomes a React element, so
 * markup in a message can never execute. Link hrefs were already allowlisted to
 * http/https/mailto by the parser — the `rel`/`target` here is defence in depth.
 * If you are tempted to add an HTML fast-path, don't.
 */
import { useState } from 'react'
import { parseMarkdown, type MdInline, type MdNode } from '@/lib/markdown'

function Inline({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text': return <span key={i}>{n.text}</span>
          case 'code': return <code key={i} className="cc-md-code">{n.text}</code>
          case 'strong': return <strong key={i}><Inline nodes={n.children} /></strong>
          case 'em': return <em key={i}><Inline nodes={n.children} /></em>
          case 'strike': return <s key={i}><Inline nodes={n.children} /></s>
          case 'link': return (
            <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow" className="cc-md-link">
              {n.text}
            </a>
          )
        }
      })}
    </>
  )
}

function CodeBlock({ lang, text }: { lang: string | null; text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard is permission-gated and absent over plain http on some
      // hosts — the block is still selectable, so fail quietly.
      setCopied(false)
    }
  }
  return (
    <div className="cc-md-fence">
      <div className="cc-md-fence-head">
        <span className="cc-md-lang">{lang || 'text'}</span>
        <button type="button" className="cc-md-copy" onClick={copy} aria-label="Copy code">
          {copied ? '✓ COPIED' : 'COPY'}
        </button>
      </div>
      <pre className="cc-md-pre"><code>{text}</code></pre>
    </div>
  )
}

function Block({ node }: { node: MdNode }) {
  switch (node.type) {
    case 'paragraph': return <p className="cc-md-p"><Inline nodes={node.children} /></p>
    case 'heading': {
      const Tag = (`h${Math.min(6, node.level + 2)}`) as 'h3'
      return <Tag className="cc-md-h"><Inline nodes={node.children} /></Tag>
    }
    case 'code': return <CodeBlock lang={node.lang} text={node.text} />
    case 'quote': return <blockquote className="cc-md-quote"><Inline nodes={node.children} /></blockquote>
    case 'hr': return <hr className="cc-md-hr" />
    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul'
      return (
        <Tag className="cc-md-list">
          {node.items.map((item, i) => <li key={i}><Inline nodes={item} /></li>)}
        </Tag>
      )
    }
  }
}

export function Markdown({ text }: { text: string }) {
  const nodes = parseMarkdown(text)
  if (!nodes.length) return null
  return <div className="cc-md">{nodes.map((n, i) => <Block key={i} node={n} />)}</div>
}
