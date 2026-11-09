'use client'

import { useState } from 'react'
import { Button, Card, CardHead, Chip, Divider, Field, Glyph, IconButton, Input, Kv, KvRow, Prompt, Row, Select, Segmented, Sheet, Stat, TextArea, Verdict, WRow, type GlyphName } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
import { SegBar } from '@/components/charts/SegBar'
import { MiniHist } from '@/components/charts/MiniHist'
import { OMALAUNCHER, OMALAUNCHER_SEMANTIC, OMARCHY, OMARCHY_SEMANTIC, WIDGET, WIDGET_SEMANTIC } from '@/lib/tokens'
import styles from './styleguide.module.css'

function Specimen({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className={styles.specimen}>
      <div className={styles.specimenName}>{name}</div>
      <div className={styles.specimenBody}>{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

function SheetSpecimens() {
  const [open, setOpen] = useState<'auto' | 'tall' | null>(null)
  return (
    <>
      <div className={styles.stack}>
        <Button variant="ghost" onClick={() => setOpen('auto')}>Open Sheet · auto</Button>
        <Button variant="ghost" onClick={() => setOpen('tall')}>Open Sheet · tall</Button>
      </div>
      <Sheet open={open != null} onClose={() => setOpen(null)} title={`Sheet · ${open ?? 'auto'}`} size={open ?? 'auto'}>
        <p className={styles.note}>Escape, the close control, or the backdrop closes this dialog. Focus is trapped while it is open.</p>
        <Button variant="primary" onClick={() => setOpen(null)}>Done</Button>
      </Sheet>
    </>
  )
}


const OMARCHY_SWATCHES: ReadonlyArray<{ name: string; hex: string; token: string }> = [
  { name: 'darker', hex: OMARCHY.darkerBackground, token: '--pt-bg' },
  { name: 'dark', hex: OMARCHY.darkBackground, token: '--pt-bg-soft' },
  { name: 'background', hex: OMARCHY.background, token: '--pt-surface' },
  { name: 'lighter', hex: OMARCHY.lighterBackground, token: '--pt-surface-2' },
  { name: 'selection', hex: OMARCHY.selection, token: '--pt-selection' },
  { name: 'muted', hex: OMARCHY.muted, token: '--pt-border*' },
  { name: 'foreground', hex: OMARCHY.foreground, token: '--pt-text' },
  { name: 'bright', hex: OMARCHY.brightForeground, token: '--pt-text-high' },
  { name: 'dim', hex: OMARCHY.darkForeground, token: '--pt-text-dim' },
  { name: 'accent', hex: OMARCHY.accent, token: '--pt-neon' },
  { name: 'active tab', hex: OMARCHY.activeTab, token: '--pt-active-tab' },
  { name: 'active border', hex: OMARCHY.activeBorder, token: '--pt-active-border' },
]

function ThemePanel({ title, palette, purist, swatches }: { title: string; palette?: 'omarchy' | 'launcher'; purist?: boolean; swatches?: boolean }) {
  return (
    <div className={styles.themePanel} data-palette={palette} style={purist ? ({ '--pt-semantic-mode': 'purist' } as React.CSSProperties) : undefined}>
      <div data-pt-semantic-root className={styles.themePanelInner}>
        <h3 className={styles.themeTitle}>{title}</h3>
        {swatches && <div className={styles.swatchGrid}>
          {(palette === 'launcher' ? LAUNCHER_SWATCHES : OMARCHY_SWATCHES).map(sw => (
            <div key={sw.name} className={styles.swatch}>
              <span className={styles.swatchChip} style={{ background: sw.hex }} />
              <span className={styles.swatchMeta}>{sw.name}<br />{sw.hex}<br />{sw.token}</span>
            </div>
          ))}
        </div>}
        <div className={styles.themeLive}>
          <span className={styles.liveLabel}>LIVE · computed from the --pt-* tokens of this panel</span>
          <div className={styles.liveRow}>
            <span className={styles.liveSwatch} style={{ background: 'var(--pt-bg)' }}>--pt-bg</span>
            <span className={styles.liveSwatch} style={{ background: 'var(--pt-bg-soft)' }}>--pt-bg-soft</span>
            <span className={styles.liveSwatch} style={{ background: 'var(--pt-neon)', color: 'var(--pt-bg)' }}>--pt-neon</span>
            <span className={styles.liveSwatch} style={{ background: 'var(--pt-text)', color: 'var(--pt-bg)' }}>--pt-text</span>
          </div>
          <div className={styles.liveRow}>
            <Chip tone="ok" icon="•">ok</Chip><Chip tone="warn" icon="•">warn</Chip><Chip tone="bad" icon="•">error</Chip><Chip tone="info" icon="•">info</Chip><Chip tone="accent" icon="•">accent</Chip>
          </div>
          <div className={styles.liveRow}>
            <Button variant="primary">primary</Button><Button variant="ghost">ghost</Button><Button variant="danger">danger</Button><Button variant="confirm">confirm</Button>
          </div>
          <Card tone="raised" pad="md"><CardHead title="Card · raised" sub="border from --pt-card-border" right={<Chip tone="info">info</Chip>} /></Card>
        </div>
      </div>
    </div>
  )
}

const LAUNCHER_SWATCHES: ReadonlyArray<{ name: string; hex: string; token: string }> = [
  { name: 'page', hex: OMALAUNCHER.bg, token: '--pt-bg' },
  { name: 'deep', hex: OMALAUNCHER.deep, token: '--pt-bg-soft' },
  { name: 'deepest', hex: OMALAUNCHER.deepest, token: '--pt-mx-carbon' },
  { name: 'card', hex: OMALAUNCHER.card, token: '--pt-card-bg (62%)' },
  { name: 'raised hover', hex: OMALAUNCHER.raisedHover, token: '--pt-btn-glass-fill-hover' },
  { name: 'accent', hex: OMALAUNCHER.accent, token: '--pt-neon' },
  { name: 'bright', hex: OMALAUNCHER.bright, token: '--pt-neon-bright' },
  { name: 'deep accent', hex: OMALAUNCHER.accentDeep, token: '--pt-neon-deep' },
  { name: 'signal', hex: OMALAUNCHER.signal, token: '--pt-glow-rgb (live only)' },
  { name: 'body', hex: OMALAUNCHER.text, token: '--pt-text' },
  { name: 'high', hex: OMALAUNCHER.textHigh, token: '--pt-text-high' },
  { name: 'dim', hex: OMALAUNCHER.dim, token: '--pt-launcher-dim' },
  { name: 'mute', hex: OMALAUNCHER.mute, token: '--pt-launcher-mute' },
]

const LAUNCHER_CREW = [
  { name: 'jarvis', state: 'live', age: '19m', live: true },
  { name: 'friday', state: 'idle', age: '15h', live: false },
  { name: 'forge', state: 'idle', age: '5d', live: false },
] as const

function LauncherPalette() {
  const s = OMALAUNCHER_SEMANTIC
  return (
    <Section title="Launcher palette (OmaLauncher)">
      <p className={styles.note}>Measured from the phone home screen (<code>artifacts/launcher-theme/reference/</code>). Slate glass, cyan structure: borders are cyan-tinted in three tiers, signal cyan glows only on live state. Shape: card 14 · row/chip/button/input 10 · pill 999. Semantic stays distinguishable: ok {s.ok.hex} · warn {s.warn.hex} · error {s.error.hex} · info {s.info.hex}. Copy uses lifted dim/mute ({OMALAUNCHER.textDim} / {OMALAUNCHER.textMute}); the measured {OMALAUNCHER.dim} / {OMALAUNCHER.mute} stay structural.</p>
      <div className={styles.launcherScope} data-palette="launcher">
        <div className={styles.swatchGrid}>
          {LAUNCHER_SWATCHES.map(sw => (
            <div key={sw.name} className={styles.swatch}>
              <span className={styles.swatchChip} style={{ background: sw.hex }} />
              <span className={styles.swatchMeta}>{sw.name}<br />{sw.hex}<br />{sw.token}</span>
            </div>
          ))}
        </div>
        <div className={styles.launcherGrid}>
          <Specimen name="card · 14px · glass, no drop shadow">
            <Card pad="md" className={styles.launcherCard}>
              <span className={styles.lxKicker}>claude code limits</span>
              <div className={styles.lxMeter}><span>5h session</span><span className={styles.lxNum}>5%</span></div>
              <span className={styles.lxBar}><span style={{ width: '5%' }} /></span>
              <span className={styles.lxMeta}>resets in 33m 28s</span>
              <div className={styles.lxMeter}><span>week</span><span className={styles.lxNum}>62%</span></div>
              <span className={styles.lxBar}><span style={{ width: '62%' }} /></span>
            </Card>
          </Specimen>
          <div className={styles.launcherStack}>
            <Specimen name="row · 10px"><div className={styles.lxRow}><span>flash-next-coder-iq1_m</span><span className={styles.lxNum}>15.0/16G</span></div></Specimen>
            <Specimen name="chip · 10px / pill · 999px">
              <span className={styles.lxChip}>pipeline 310</span>
              <span className={styles.lxPill}>6 awaiting</span>
              <Chip tone="ok">ok</Chip><Chip tone="warn">warn</Chip><Chip tone="bad">error</Chip>
            </Specimen>
            <Specimen name="status rows · 6px dot · glow on live only">
              <div className={styles.lxStatusList}>
                {LAUNCHER_CREW.map(c => (
                  <div key={c.name} className={styles.lxStatus}>
                    <span className={styles.lxDot} data-live={c.live || undefined} />
                    <span>{c.name}</span>
                    <span className={styles.lxMeta}>{c.state}</span>
                    <span className={styles.lxNum}>{c.age}</span>
                  </div>
                ))}
              </div>
            </Specimen>
            <Specimen name="progress · 3px · accent on 15% track"><span className={styles.lxBar} style={{ width: '100%' }}><span style={{ width: '41%' }} /></span></Specimen>
            <Specimen name="button / input · 10px"><Button variant="ghost">Open</Button><Input aria-label="Launcher input specimen" placeholder="open an app or ask pi…" /></Specimen>
          </div>
        </div>
      </div>
    </Section>
  )
}

function ThemeCompare() {
  const a = OMARCHY_SEMANTIC.adaptive
  const p = OMARCHY_SEMANTIC.purist
  return (
    <Section title="Theme · current vs Omarchy (PT)">
      <p className={styles.note}>Left: the active theme tokens. Right: the Omarchy palette, hex for hex from <code>/usr/share/omarchy/themes/lumon/colors.toml</code>. Semantic mode defaults to <code>adaptive</code> (ok {a.ok.hex} · warn {a.warn.hex} · error {a.error.hex}); <code>purist</code> is the literal monochrome set (ok {p.ok.hex} · warn {p.warn.hex} · error {p.error.hex}).</p>
      <div className={styles.themeGrid}>
        <ThemePanel title="CURRENT · active theme" />
        <ThemePanel title="OMARCHY (PT) · --pt-semantic-mode: adaptive" palette="omarchy" swatches />
      </div>
      <div className={styles.themeGridSingle}>
        <ThemePanel title="OMARCHY (PT) · --pt-semantic-mode: purist" palette="omarchy" purist />
      </div>
      <div className={styles.themeGrid}>
        <ThemePanel title="CURRENT · active theme" />
        <ThemePanel title="LAUNCHER (OmaLauncher) · measured from phone frames" palette="launcher" swatches />
      </div>
    </Section>
  )
}

const GLYPHS: ReadonlyArray<[GlyphName, string]> = [
  ['run', 'running'], ['idle', 'idle / unknown'], ['fail', 'failed · stopped (amber)'], ['err', 'error · down (red)'],
  ['retry', 'retrying · stale'], ['up', 'up'], ['down', 'down'], ['ok', 'done · ok'], ['live', 'live (the one cyan)'], ['todo', 'next / todo'],
]
const HIST_14D = [2, 0, 4, 3, 6, 1, 0, 5, 7, 3, 2, 8, 4, 3]
const WIDGET_SWATCHES: ReadonlyArray<[string, string]> = [
  ['bg', WIDGET.bg], ['card', WIDGET.card], ['card2', WIDGET.card2], ['line', WIDGET.line], ['lineStrong', WIDGET.lineStrong],
  ['accent', WIDGET.accent], ['accentBright', WIDGET.accentBright], ['cyan', WIDGET.cyan], ['segOff', WIDGET.segOff],
  ['text', WIDGET.text], ['text2', WIDGET.text2], ['text3', WIDGET.text3],
  ['warn', WIDGET_SEMANTIC.warn.hex], ['error', WIDGET_SEMANTIC.error.hex], ['ok', WIDGET_SEMANTIC.ok.hex],
]

/** The widget contract (docs/polish-plan-2026-11-09.md §1.5), rendered. */
function Widgets() {
  return (
    <Section title="Widgets">
      <p className={styles.note}>The launcher-widget primitives every route builds from. Cards are <code>.mc-widget</code>; headers are <code>&lt;Prompt&gt;</code>; section breaks are <code>&lt;Divider&gt;</code>; the one sans numeral per card is <code>&lt;Verdict&gt;</code>; charts are <code>&lt;SegBar&gt;</code> and <code>&lt;MiniHist&gt;</code>; state is a <code>&lt;Glyph&gt;</code>, never an LED. Flat: no shadow, gradient, blur or glow.</p>
      <div className={styles.swatchGrid}>
        {WIDGET_SWATCHES.map(([name, hex]) => (
          <div key={name} className={styles.swatch}>
            <span className={styles.swatchChip} style={{ background: hex }} />
            <span className={styles.swatchMeta}>{name}<br />{hex}</span>
          </div>
        ))}
      </div>
      <div className={styles.widgetGrid}>
        <Specimen name="composition · desk:~$ kanban">
          <section className="mc-widget">
            <Prompt host="desk" cmd="kanban" />
            <Verdict unit="open">4</Verdict>
            <div className={styles.glyphCounts}><Glyph g="run" />0 <Glyph g="fail" />3 <Glyph g="idle" />1</div>
            <Kv>
              <KvRow k="done" v="3 today" r="67 wk" />
              <KvRow k="streak" v="10d" r="best 31" />
            </Kv>
            <div className={styles.histRow}><span>14d</span><MiniHist values={HIST_14D} label="completions per day, last 14 days" /></div>
            <Divider label="needs you 2" />
            <WRow g="fail" right="2d">AEGIS (product) review the onboarding flow copy</WRow>
            <WRow g="err" right="5d">scout gateway down since tuesday</WRow>
            <Prompt host="desk" foot meta="↻ 15s" />
          </section>
        </Specimen>
        <Specimen name="composition · friday:~$ top">
          <section className="mc-widget">
            <Prompt host="friday" cmd="top" />
            <div className={styles.meterRow}><span>cpu</span><SegBar value={44} autoTone label="cpu" /><span>44% 64°</span></div>
            <div className={styles.meterRow}><span>mem</span><SegBar value={86} autoTone label="memory" /><span>86% 40G</span></div>
            <div className={styles.meterRow}><span>disk</span><SegBar value={96} autoTone label="disk" /><span>96% 119G</span></div>
            <div className={styles.meterRow}><span>gpu</span><SegBar value={64} tone="cyan" label="gpu" /><span>64% 67°</span></div>
            <Divider label="top" />
            <WRow g="run" right="5.0%">strata</WRow>
            <WRow g="idle" right="0.4%" dim>ollama</WRow>
            <Prompt host="friday" foot meta="up 10d 20h" />
          </section>
        </Specimen>
        <Specimen name="composition · CLAUDE weekly card">
          <section className="mc-widget">
            <div className={styles.cardKicker}>CLAUDE</div>
            <Verdict unit="this week">3%</Verdict>
            <Kv keyWidth="8ch">
              <KvRow k="session" v={<SegBar value={0} thin label="session" />} r="0%" />
              <KvRow k="week" v={<SegBar value={3} thin label="week" />} r="3%" />
            </Kv>
            <div className={styles.dotsRow}><span>day</span><span className="mc-dots">{Array.from({ length: 24 }, (_, i) => <i key={i} className={i < 14 ? 'on' : undefined} />)}</span></div>
          </section>
        </Specimen>
      </div>
      <div className={styles.gridThree}>
        <Specimen name="Prompt · desk / friday / phone">
          <div className={styles.stackCol}>
            <Prompt host="desk" cmd="costs" />
            <Prompt host="friday" cmd="chat jarvis" meta="↻ 29s" />
            <Prompt host="phone" cmd="agent top" />
          </div>
        </Specimen>
        <Specimen name="Divider · as div / as h2">
          <div className={styles.stackCol}>
            <Divider label="tasks 3/4" />
            <Divider as="h3" label="engines 1/3" />
          </div>
        </Specimen>
        <Specimen name="Verdict · plain / warn / crit">
          <div className={styles.stackCol}>
            <Verdict unit="this month">$412</Verdict>
            <Verdict tone="warn" unit="mem">86%</Verdict>
            <Verdict tone="crit">71°</Verdict>
          </div>
        </Specimen>
        <Specimen name="SegBar · accent / warn / crit / cyan / thin">
          <div className={styles.stackCol}>
            <SegBar value={44} />
            <SegBar value={86} tone="warn" />
            <SegBar value={97} tone="crit" />
            <SegBar value={64} tone="cyan" />
            <SegBar value={30} thin />
          </div>
        </Specimen>
        <Specimen name="MiniHist · 14d / 24h">
          <div className={styles.stackCol}>
            <MiniHist values={HIST_14D} />
            <MiniHist values={[0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 4, 6, 5, 3, 2, 4, 1, 0, 0, 0, 0, 0, 0, 0]} days={24} />
          </div>
        </Specimen>
        <Specimen name="Glyph · the set">
          <div className={styles.stackCol}>
            {GLYPHS.map(([g, label]) => <div key={g} className={styles.glyphRow}><Glyph g={g} /> <code>{g}</code> {label}</div>)}
          </div>
        </Specimen>
        <Specimen name=".mc-dots · day / week">
          <div className={styles.stackCol}>
            <span className="mc-dots">{Array.from({ length: 24 }, (_, i) => <i key={i} className={i < 15 ? 'on' : undefined} />)}</span>
            <span className="mc-dots">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < 1 ? 'on' : undefined} />)}</span>
          </div>
        </Specimen>
        <Specimen name="Kv · KvRow">
          <Kv>
            <KvRow k="tokens" v="11.9M" />
            <KvRow k="saved" v="$50.25" r="+$0.66" />
            <KvRow k="reqs" v="14,898" r="+225" />
          </Kv>
        </Specimen>
        <Specimen name="WRow · plain / dim / link">
          <div className={styles.stackCol}>
            <WRow g="ok" right="12m">nightly backup finished</WRow>
            <WRow g="idle" right="3h" dim>forge idle</WRow>
            <WRow g="run" right="›" href="#primitives">open the board</WRow>
          </div>
        </Specimen>
      </div>
    </Section>
  )
}

export default function StyleGuide() {
  const [segment, setSegment] = useState('today')
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="~/styleguide · DECK-VOCABULARY"
        title="styleguide"
        command="styleguide"
        subtitle="Widget tokens and shared component vocabulary"
        actions={<Button variant="ghost" href="#primitives">Components</Button>}
      />

      <p className={styles.intro}>The living contract for the one Mission Control visual language: the launcher widgets. Variant names sit beside each specimen so a contributor can choose the shared primitive before writing new UI.</p>

      <div id="primitives" className={styles.content}>
        <Widgets />
        <LauncherPalette />
        <ThemeCompare />
        <Section title="Card / CardHead">
          <div className={styles.gridThree}>
            <Specimen name="Card · default">
              <Card pad="md"><CardHead title="Default surface" sub="Base panel elevation" /></Card>
            </Specimen>
            <Specimen name="Card · raised">
              <Card tone="raised" pad="md"><CardHead title="Raised surface" right={<Chip tone="info">info</Chip>} /></Card>
            </Specimen>
            <Specimen name="Card · sunken">
              <Card tone="sunken" pad="md"><CardHead title="Sunken surface" sub="Recessed content well" /></Card>
            </Specimen>
          </div>
        </Section>

        <Section title="Button">
          <div className={styles.gridFour}>
            {(['primary', 'ghost', 'danger', 'confirm'] as const).map(variant => (
              <Specimen key={variant} name={`Button · ${variant}`}>
                <Button variant={variant}>{variant}</Button>
              </Specimen>
            ))}
          </div>
        </Section>

        <Section title="Field / Input / TextArea / Select">
          <div className={styles.gridThree}>
            <Specimen name="Field · hint + Input">
              <Field label="Mission name" hint="A short human-readable identifier."><Input defaultValue="Friday" /></Field>
            </Specimen>
            <Specimen name="Field · error + TextArea">
              <Field label="Briefing" error="A briefing is required."><TextArea placeholder="Write a briefing…" /></Field>
            </Specimen>
            <Specimen name="Select · native mobile picker">
              <Field label="Priority"><Select defaultValue="normal"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></Select></Field>
            </Specimen>
          </div>
        </Section>

        <Section title="Segmented">
          <div className={styles.gridTwo}>
            <Specimen name="Segmented · sm">
              <Segmented size="sm" options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }]} value={segment} onChange={setSegment} />
            </Specimen>
            <Specimen name="Segmented · md · controlled value: today">
              <Segmented size="md" options={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }]} value={segment} onChange={setSegment} />
            </Specimen>
          </div>
        </Section>

        <Section title="Chip">
          <div className={styles.chipGrid}>
            {(['neutral', 'info', 'ok', 'warn', 'bad', 'accent'] as const).map(tone => (
              <Specimen key={tone} name={`Chip · ${tone}`}><Chip tone={tone} icon="•">{tone}</Chip></Specimen>
            ))}
          </div>
        </Section>

        <Section title="IconButton">
          <div className={styles.gridThree}>
            <Specimen name="IconButton · required aria-label"><IconButton aria-label="Open menu">≡</IconButton></Specimen>
            <Specimen name="IconButton · close"><IconButton aria-label="Close panel">×</IconButton></Specimen>
            <Specimen name="IconButton · disabled"><IconButton aria-label="Unavailable action" disabled>⋯</IconButton></Specimen>
          </div>
        </Section>

        <Section title="Stat">
          <div className={styles.gridThree}>
            <Specimen name="Stat · hero · accent · series"><Stat size="hero" tone="accent" label="Throughput" value="42,918" sub="events today" series={[12, 18, 15, 24, 20, 31, 28]} /></Specimen>
            <Specimen name="Stat · lg · ok"><Stat size="lg" tone="ok" label="Healthy" value="98.4%" sub="last 24 hours" /></Specimen>
            <Specimen name="Stat · md · warn"><Stat size="md" tone="warn" label="Attention" value="07" sub="open items" /></Specimen>
          </div>
          <div className={styles.gridThree}>
            <Specimen name="Stat · md · neutral"><Stat label="Neutral" value="12" /></Specimen>
            <Specimen name="Stat · md · info"><Stat tone="info" label="Info" value="24" /></Specimen>
            <Specimen name="Stat · md · bad"><Stat tone="bad" label="Bad" value="03" /></Specimen>
          </div>
        </Section>

        <Section title="Row">
          <Card>
            <Specimen name="Row · div"><Row leading={<Chip tone="ok">OK</Chip>} title="Passive list row" sub="No interaction" trailing="—" /></Specimen>
            <Specimen name="Row · button · onClick"><Row leading="◉" title="Interactive list row" sub="Renders a real button" trailing={<Button variant="ghost">Open</Button>} onClick={() => undefined} /></Specimen>
            <Specimen name="Row · anchor · href"><Row leading="↗" title="Linked list row" sub="Renders a real anchor" href="#primitives" trailing="View" /></Specimen>
          </Card>
        </Section>

        <Section title="Sheet">
          <Specimen name="Sheet · auto + tall · focus trap / Escape / backdrop close"><SheetSpecimens /></Specimen>
        </Section>

        <Section title="ADOPTION RULES">
          <ol className={styles.rules}>
            <li>Any button = <code>&lt;Button&gt;</code> from <code>components/ui</code> or <code>&lt;IconButton&gt;</code>. Never a raw <code>&lt;button&gt;</code> with hand-rolled pill styling.</li>
            <li>Any panel/surface = <code>&lt;Card&gt;</code>. Any metric = <code>&lt;Stat&gt;</code>. Any list row = <code>&lt;Row&gt;</code>. Any status pill = <code>&lt;Chip&gt;</code>. Any modal = <code>&lt;Sheet&gt;</code>.</li>
            <li>New component-specific styling goes in that component&apos;s own <code>*.module.css</code>. <code>app/globals.css</code> is coordinator-owned and must not be edited by feature work.</li>
            <li>Colors/spacing/radii/type ALWAYS come from <code>var(--pt-*)</code> tokens.</li>
          </ol>
        </Section>
      </div>
    </div>
  )
}
