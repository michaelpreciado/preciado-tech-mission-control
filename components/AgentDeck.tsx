'use client'

import { useCallback, useEffect, useState } from 'react';
import type { HerdrAgent, HerdrKind, HerdrSnapshot } from '@/lib/herdr-types';
import { Button, Card, Field, Input, KvRow, Prompt, Select, Sheet, TextArea, WRow, type GlyphName } from './ui'
import styles from './Kanban.module.css';
import { apiFetch } from '@/lib/api-base';

/** A 401/403 from herdr: retrying on a timer cannot fix it, only a new token can. */
class HerdrAuthError extends Error {}

const HERDR_GLYPH: Record<string, GlyphName> = { working: 'run', running: 'run', busy: 'run', idle: 'idle', done: 'ok', error: 'err', failed: 'err', blocked: 'fail' };

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
  const [unauthorized, setUnauthorized] = useState(false);
  const request = useCallback(async (url: string, init: RequestInit = {}) => {
    const response = await apiFetch(url, { ...init, cache: 'no-store', headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers,
    } });
    const body = await response.json();
    if (response.status === 401 || response.status === 403) throw new HerdrAuthError('Access requires a trusted connection or API token. Set one below.');
    if (!response.ok) throw new Error(typeof body.error === 'string' ? `${body.error}${body.target ? ` Pane: ${body.target}.` : ''}` : 'The request failed. Try again.');
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
        if (!stopped) { setSnapshot(result); setError(''); setUnauthorized(false); }
      } catch (e) {
        // Unauthorized is terminal for this token: stop polling until the token changes.
        if (e instanceof HerdrAuthError) { stopped = true; setUnauthorized(true); setError(''); }
        else if (!stopped && !controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load agents.');
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
  const close = useCallback(() => { setSelected(null); setLauncher(false); }, []);
  const current = snapshot?.agents.find(agent => agent.id === selected?.id) ?? selected;

  return <section className={`mc-widget ${styles.agentDeck}`} aria-label="Live agent deck">
    <header className={styles.agentHeader}><Prompt as="h2" host="desk" cmd="herdr ls" meta={unauthorized ? undefined : '↻ 4s'} />
      <Button type="button" disabled={busy || !snapshot?.available} onClick={() => { setLauncher(true); setError(''); setNotice(''); }}>New agent</Button></header>
    {unauthorized && <KvRow k="herdr" v="unauthorized" r="" />}
    <div className={styles.agentAccess}><form onSubmit={event => { event.preventDefault(); const nextToken = credential.trim(); setToken(nextToken); onCredentialChange?.(nextToken); setCredential(''); }}>
      <Field label="API bearer token"><Input type="password" autoComplete="off" value={credential} onChange={e => setCredential(e.target.value)} placeholder={token ? 'Token is set for this page session' : 'Only if required by your server'} /></Field>
      <Button type="submit">{credential.trim() ? 'Use token' : 'Clear token'}</Button><span className={styles.muted}>Kept only in memory for this page session.</span>
    </form></div>
    {error && <p role="alert" className={styles.agentMessage}>{error}</p>}
    {notice && <p role="status" className={styles.agentMessage}>{notice}</p>}
    {!snapshot && !error && !unauthorized && <p role="status">connecting to herdr…</p>}
    {snapshot && !snapshot.available && <KvRow k="herdr" v={snapshot.error || 'unavailable'} r="" />}
    {snapshot?.available && snapshot.agents.length === 0 && <WRow g="idle" dim>no agents running</WRow>}
    {!!snapshot?.agents.length && <div className={styles.agentList}>{snapshot.agents.map(agent => <div key={agent.id}>
      <WRow g={HERDR_GLYPH[agent.status] ?? 'idle'} right={`${agent.kind || 'unknown'}${agent.focused ? ' · focus' : ''}`} title={agent.cwd}
        onClick={() => { setSelected(agent); setRename(agent.name); setPrompt(''); setError(''); setNotice(''); }}>
        {agent.name || agent.id} <span className={styles.muted}>{agent.status || 'unknown'}</span>
      </WRow>
      <span className={styles.agentPath}>{agent.cwd || 'working directory unavailable'}</span>
    </div>)}</div>}
    {snapshot && <Prompt host="desk" foot meta={new Date(snapshot.generatedAt).toLocaleTimeString()} />}
    <Sheet open={!!selected || launcher} onClose={close} title={launcher ? 'Launch agent' : current?.name || current?.id || 'Agent'} size="tall">
      <div className={styles.agentDialog}>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {launcher && <form onSubmit={async event => { event.preventDefault(); if (await act({ op: 'spawn', kind, cwd, model: model || undefined, name: name || undefined, prompt: opening || undefined, direction: 'right' }, 'Agent launched.')) close(); }}>
        <fieldset disabled={busy} className={styles.agentFields}>
          <Field label="Agent type"><Select disabled={busy} value={kind} onChange={e => setKind(e.target.value as HerdrKind)}><option value="codex">Codex</option><option value="claude">Claude</option><option value="opencode">OpenCode</option></Select></Field>
          <Field label="Name (optional)"><Input disabled={busy} value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Model (optional)"><Input disabled={busy} value={model} onChange={e => setModel(e.target.value)} placeholder="Agent default" /></Field>
          <Field label="Working directory"><Input disabled={busy} required value={cwd} onChange={e => setCwd(e.target.value)} placeholder="/absolute/path/to/project" /></Field>
          <div className={styles.agentActions}>{snapshot?.workspaces.filter(workspace => workspace.cwd).map(workspace => <Button disabled={busy} type="button" key={workspace.id} onClick={() => setCwd(workspace.cwd)}>{workspace.name}</Button>)}</div>
          <Field label="Opening prompt (optional)"><TextArea disabled={busy} rows={4} value={opening} onChange={e => setOpening(e.target.value)} /></Field>
          <Button disabled={busy} type="submit">{busy ? 'Launching…' : 'Launch agent'}</Button>
        </fieldset>
      </form>}
      {current && <><p>{current.kind} · {current.status} · {current.cwd}</p>
        {tailError && <p role="alert">{tailError}</p>}<Card tone="sunken"><pre className={styles.agentTail} aria-label="Live terminal output" tabIndex={0}>{tail || 'Loading output…'}</pre></Card>
        <fieldset disabled={busy} className={styles.agentFields}>
          <form onSubmit={async event => { event.preventDefault(); if (await act({ op: 'prompt', target: current.id, text: prompt }, 'Prompt sent.')) setPrompt(''); }}>
            <Field label="Prompt"><TextArea disabled={busy} rows={3} required value={prompt} onChange={e => setPrompt(e.target.value)} /></Field><div className={styles.agentActions}><Button disabled={busy || !prompt.trim()} type="submit">Send prompt</Button><Button type="button" disabled={busy || !prompt.trim()} onClick={async () => { if (await act({ op: 'prompt', target: current.id, text: prompt, wait: true }, 'Prompt sent; wait finished.')) setPrompt(''); }}>Send and wait</Button></div>
          </form>
          <div className={styles.agentActions}>{['esc', 'up', 'enter'].map(key => <Button disabled={busy} type="button" key={key} onClick={() => void act({ op: 'send-keys', target: current.id, keys: [key] }, `${key} sent.`)}>{key}</Button>)}
            <Button disabled={busy} type="button" onClick={() => void act({ op: 'focus', target: current.id }, 'Agent focused in herdr.')}>Focus</Button>
            <Button disabled={busy} type="button" onClick={() => void act({ op: 'stop', target: current.id }, 'Interrupt sent. The pane remains open.')}>Stop / interrupt</Button></div>
          <form onSubmit={event => { event.preventDefault(); void act({ op: 'rename', target: current.id, name: rename }, 'Agent renamed.'); }}><Field label="Agent name"><Input disabled={busy} required value={rename} onChange={e => setRename(e.target.value)} /></Field><Button type="submit" disabled={busy || !rename.trim()}>Rename</Button></form>
        </fieldset></>}
      </div>
    </Sheet>
  </section>;
}
