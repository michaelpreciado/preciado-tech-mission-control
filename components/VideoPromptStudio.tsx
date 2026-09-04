'use client'

import { useEffect, useState } from 'react'

type IdeaPreset = {
  id?: string
  week: number
  title: string
  outline?: string[] | string
}

type PromptResponse = { prompt?: string; chars?: number; error?: string }

function outlineSteps(outline: IdeaPreset['outline']): string {
  const beats = Array.isArray(outline)
    ? outline
    : typeof outline === 'string'
      ? outline.split(/\r?\n/).filter(Boolean)
      : []
  return beats.map((beat, index) => `Step ${index + 1}: ${beat.replace(/^step\s+\d+\s*:\s*/i, '')}`).join('\n')
}

export function VideoPromptStudio() {
  const [ideas, setIdeas] = useState<IdeaPreset[]>([])
  const [selected, setSelected] = useState('manual')
  const [topic, setTopic] = useState('')
  const [hook, setHook] = useState('')
  const [steps, setSteps] = useState('')
  const [terminal, setTerminal] = useState('')
  const [payoff, setPayoff] = useState('')
  const [length, setLength] = useState(30)
  const [prompt, setPrompt] = useState('')
  const [chars, setChars] = useState(0)
  const [building, setBuilding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/ml-content', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then(data => { if (active) setIdeas(Array.isArray(data.ideas) ? data.ideas : []) })
      .catch(() => { /* Presets are optional; manual mode remains available. */ })
    return () => { active = false }
  }, [])

  const choosePreset = (value: string) => {
    setSelected(value)
    setError(null)
    if (value === 'manual') {
      setTopic('')
      setHook('')
      setSteps('')
      return
    }
    const idea = ideas[Number(value)]
    if (!idea) return
    setTopic(idea.title)
    setHook('')
    setSteps(outlineSteps(idea.outline))
  }

  const buildPrompt = async () => {
    setBuilding(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        topic,
        hook,
        steps,
        terminal,
        payoff,
        length: String(length),
      })
      const response = await fetch(`/api/content-prompt?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json() as PromptResponse
      if (!response.ok || typeof data.prompt !== 'string') throw new Error(data.error || `HTTP ${response.status}`)
      setPrompt(data.prompt)
      setChars(data.chars ?? data.prompt.length)
    } catch (buildError) {
      setError(`> build failed: ${(buildError as Error).message}`)
    } finally {
      setBuilding(false)
    }
  }

  const copyPrompt = async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setError('> copy failed: clipboard unavailable')
    }
  }

  return (
    <div className="mc-studio">
      <section className="mc-studio-inputs" aria-label="Production studio inputs">
        <div className="mc-studio-panel-title">INPUTS</div>
        <label className="mc-studio-field">
          <span>IDEA PRESET</span>
          <select className="mc-content-select mc-studio-control" value={selected} onChange={event => choosePreset(event.target.value)}>
            <option value="manual">manual / blank</option>
            {ideas.map((idea, index) => (
              <option key={idea.id || `${idea.week}-${index}`} value={String(index)}>#{idea.week} · {idea.title}</option>
            ))}
          </select>
        </label>
        <label className="mc-studio-field">
          <span>TOPIC</span>
          <input value={topic} onChange={event => setTopic(event.target.value)} />
        </label>
        <label className="mc-studio-field">
          <span>HOOK LINE <small>max 6 words</small></span>
          <input value={hook} onChange={event => setHook(event.target.value)} />
        </label>
        <label className="mc-studio-field">
          <span>STEPS</span>
          <textarea
            rows={8}
            value={steps}
            onChange={event => setSteps(event.target.value)}
            placeholder={'Step 1: Boot\n- one short bullet\n\nStep 2: Build\n- another bullet'}
          />
        </label>
        <label className="mc-studio-field">
          <span>TERMINAL COMMAND</span>
          <input value={terminal} onChange={event => setTerminal(event.target.value)} />
        </label>
        <label className="mc-studio-field">
          <span>PAYOFF</span>
          <input value={payoff} onChange={event => setPayoff(event.target.value)} />
        </label>
        <label className="mc-studio-field mc-studio-length">
          <span>LENGTH</span>
          <input type="number" min={25} max={32} value={length} onChange={event => setLength(Number(event.target.value))} />
        </label>
        <button type="button" className="mc-studio-btn" onClick={buildPrompt} disabled={building}>
          {building ? 'BUILDING…' : '> BUILD PROMPT'}
        </button>
      </section>

      <section className="mc-studio-output" aria-label="Master video prompt output">
        <div className="mc-studio-output-head">
          <span>MASTER VIDEO PROMPT</span>
          <span className="mc-studio-charcount">{chars.toLocaleString()} chars</span>
          <button type="button" className="mc-studio-copybtn" onClick={copyPrompt} disabled={!prompt}>
            {copied ? 'COPIED ✓' : 'COPY'}
          </button>
        </div>
        {error && <div className="mc-studio-error" role="alert">{error}</div>}
        <div className="mc-studio-prompt-card">
          {prompt
            ? <pre className="mc-prompt-out">{prompt}</pre>
            : <div className="mc-studio-empty">&gt; select an idea, then BUILD PROMPT<span className="mc-studio-cursor">_</span></div>}
        </div>
      </section>
    </div>
  )
}
