'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { HerdrAgent, HerdrKind, HerdrSnapshot } from '@/lib/herdr-types';
import styles from './AgentDeck.module.css';
import { AsciiPanelTrim } from '@/app/vf/Ascii';

// Memory only: credentials are discarded when this component unmounts.
export default function AgentDeck({ onCredentialChange }: { onCredentialChange?: (token: string) => void }) {
  const [token, setToken] = useState('');
  const [credential, setCredential] = useState('');
  const [snapshot, setSnapshot] = useState<HerdrSnapshot | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<HerdrAgent | null>(null);
  const [launcher, setLauncher] = useState(false);
  const [tail, setTail] = useState('');
  const [tailError, setTailError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [rename, setRename] = useState('');
  const [kind, setKind] = useState<HerdrKind>('codex');
  const [model, setModel] = useState('');
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState('');
  const [opening, setOpening] = useState('');
  const [revision, setRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useCallback(async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { ...init, cache: 'no-store', headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers,
    } });
    const body = await response.json();
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? 'Access requires a trusted connection or API token. Open Access below.'
      : typeof body.error === 'string' ? `${body.error}${body.target ? ` Pane: ${body.target}.` : ''}` : 'The request failed. Try again.');
    return body;
  }, [token]);

  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('mc-herdr-refresh', refresh);
    const target = new URLSearchParams(window.location.search).get('agent');
    if (target && /^w[A-Za-z0-9]+:p[A-Za-z0-9]+$/.test(target)) setSelected({ id: target, name: target, kind: 'unknown', status: 'unknown', cwd: '', focused: false });
    return () => window.removeEventListener('mc-herdr-refresh', refresh);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let running = false;
    const poll = async () => {
      if (stopped || document.hidden || running) return;
      running = true;
      controller = new AbortController();
      try {
        const result = await request('/api/herdr', { signal: controller.signal }) as HerdrSnapshot;
        if (!stopped) { setSnapshot(result); setError(''); }
      } catch (e) {
        if (!stopped && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load agents.');
      } finally {
        running = false;
        if (!stopped && !document.hidden) timer = setTimeout(poll, 4000);
      }
    };
    const visibility = () => { clearTimeout(timer); if (document.hidden) controller?.abort(); else void poll(); };
    document.addEventListener('visibilitychange', visibility);
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); };
  }, [request, revision]);

  useEffect(() => {
    if (!selected) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    setTail(''); setTailError('');
    const poll = async () => {
      if (stopped || running || document.hidden) return;
      running = true;
      controller = new AbortController();
      try {
        const data = await request(`/api/herdr/agent/${encodeURIComponent(selected.id)}/tail?lines=80`, { signal: controller.signal });
        if (!stopped) { setTail(data.text || 'No terminal output yet.'); setTailError(''); }
      } catch (e) {
        if (!stopped && !controller.signal.aborted) setTailError(e instanceof Error ? e.message : 'Unable to read output.');
      } finally { running = false; if (!stopped && !document.hidden) timer = setTimeout(poll, 2500); }
    };
    const visibility = () => { clearTimeout(timer); if (document.hidden) controller?.abort(); else void poll(); };
    document.addEventListener('visibilitychange', visibility);
    void poll();
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', visibility); };
  }, [selected, request]);

  useEffect(() => {
    if (selected || launcher) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected, launcher]);

  const act = async (payload: Record<string, unknown>, success: string) => {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request('/api/herdr/agent', { method: 'POST', body: JSON.stringify(payload) });
      setNotice(result.warning ? `${success} ${result.warning}` : success);
      setRevision(value => value + 1);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); return false; }
    finally { setBusy(false); }
  };
  const close = () => { setSelected(null); setLauncher(false); };
  const current = snapshot?.agents.find(agent => agent.id === selected?.id) ?? selected;

  return <section className={`${styles.deck} cyber-agent-deck`} aria-label="Live agent deck">
    <AsciiPanelTrim />
    <header className={styles.header}><div><h2>Agent deck</h2><p>Live local agent instances · updates every 4 seconds</p></div>
      <button type="button" disabled={busy || !snapshot?.available} onClick={() => { setLauncher(true); setError(''); setNotice(''); }}>New agent</button></header>
    <details className={styles.access}><summary>Access</summary><form onSubmit={event => { event.preventDefault(); const nextToken = credential.trim(); setToken(nextToken); onCredentialChange?.(nextToken); setCredential(''); }}>
      <label>API bearer token<input type="password" autoComplete="off" value={credential} onChange={e => setCredential(e.target.value)} placeholder={token ? 'Token is set for this page session' : 'Only if required by your server'} /></label>
      <button type="submit">{credential.trim() ? 'Use token' : 'Clear token'}</button><small>Kept only in memory for this page session.</small>
    </form></details>
    {error && <p role="alert" className={styles.message}>{error}</p>}
    {notice && <p role="status" className={styles.message}>{notice}</p>}
    {!snapshot && !error && <p role="status">Connecting to herdr…</p>}
    {snapshot && !snapshot.available && <p role="status">Herdr is unavailable. {snapshot.error || 'Start herdr on this machine to connect.'}</p>}
    {snapshot?.available && snapshot.agents.length === 0 && <p>No agent instances yet. Launch an agent to begin.</p>}
    <div className={styles.grid}>{snapshot?.agents.map(agent => <button key={agent.id} type="button" className={`${styles.tile} ${agent.focused ? styles.focused : ''}`} onClick={() => { setSelected(agent); setRename(agent.name); setPrompt(''); setError(''); setNotice(''); }}>
      <span className={styles.row}><strong>{agent.name || agent.id}</strong><span>{agent.kind || 'unknown'}</span></span>
      <span className={styles.row}><span>● {agent.status || 'unknown'}</span>{agent.focused && <small>Focused</small>}</span>
      <span className={styles.path} title={agent.cwd}>{agent.cwd || 'Working directory unavailable'}</span>
    </button>)}</div>
    {snapshot && <small>Last snapshot: {new Date(snapshot.generatedAt).toLocaleTimeString()}</small>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="agent-deck-dialog-title" onCancel={close} onClose={close}>
      <header className={styles.header}><h2 id="agent-deck-dialog-title">{launcher ? 'Launch agent' : current?.name || current?.id}</h2><button type="button" onClick={close}>Close</button></header>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {launcher && <form onSubmit={async event => { event.preventDefault(); if (await act({ op: 'spawn', kind, cwd, model: model || undefined, name: name || undefined, prompt: opening || undefined, direction: 'right' }, 'Agent launched.')) close(); }}>
        <fieldset disabled={busy} className={styles.fields}>
          <label>Agent type<select value={kind} onChange={e => setKind(e.target.value as HerdrKind)}><option value="codex">Codex</option><option value="claude">Claude</option><option value="opencode">OpenCode</option></select></label>
          <label>Name (optional)<input value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Model (optional)<input value={model} onChange={e => setModel(e.target.value)} placeholder="Agent default" /></label>
          <label>Working directory<input required value={cwd} onChange={e => setCwd(e.target.value)} placeholder="/absolute/path/to/project" /></label>
          <div className={styles.actions}>{snapshot?.workspaces.filter(workspace => workspace.cwd).map(workspace => <button type="button" key={workspace.id} onClick={() => setCwd(workspace.cwd)}>{workspace.name}</button>)}</div>
          <label>Opening prompt (optional)<textarea rows={4} value={opening} onChange={e => setOpening(e.target.value)} /></label>
          <button type="submit">{busy ? 'Launching…' : 'Launch agent'}</button>
        </fieldset>
      </form>}
      {current && <><p>{current.kind} · {current.status} · {current.cwd}</p>
        {tailError && <p role="alert">{tailError}</p>}<pre className={styles.tail} aria-label="Live terminal output" tabIndex={0}>{tail || 'Loading output…'}</pre>
        <fieldset disabled={busy} className={styles.fields}>
          <form onSubmit={async event => { event.preventDefault(); if (await act({ op: 'prompt', target: current.id, text: prompt }, 'Prompt sent.')) setPrompt(''); }}>
            <label>Prompt<textarea rows={3} required value={prompt} onChange={e => setPrompt(e.target.value)} /></label><div className={styles.actions}><button disabled={!prompt.trim()} type="submit">Send prompt</button><button type="button" disabled={!prompt.trim()} onClick={async () => { if (await act({ op: 'prompt', target: current.id, text: prompt, wait: true }, 'Prompt sent; wait finished.')) setPrompt(''); }}>Send and wait</button></div>
          </form>
          <div className={styles.actions}>{['esc', 'up', 'enter'].map(key => <button type="button" key={key} onClick={() => void act({ op: 'send-keys', target: current.id, keys: [key] }, `${key} sent.`)}>{key}</button>)}
            <button type="button" onClick={() => void act({ op: 'focus', target: current.id }, 'Agent focused in herdr.')}>Focus</button>
            <button type="button" onClick={() => void act({ op: 'stop', target: current.id }, 'Interrupt sent. The pane remains open.')}>Stop / interrupt</button></div>
          <form onSubmit={event => { event.preventDefault(); void act({ op: 'rename', target: current.id, name: rename }, 'Agent renamed.'); }}><label>Agent name<input required value={rename} onChange={e => setRename(e.target.value)} /></label><button type="submit" disabled={!rename.trim()}>Rename</button></form>
        </fieldset></>}
    </dialog>
  </section>;
}
