'use client'

import { useState } from 'react'
import { Button, Card, CardHead, Chip, Field, IconButton, Input, Row, Select, Segmented, Sheet, Stat, TextArea } from '@/components/ui'
import { PageHeader } from '@/components/PageHeader'
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

const glassConcepts = [
  { id: 'frost', letter: 'A', name: 'Frosted Deck', idea: 'A physical pane. Generous frost, a broad top reflection, soft depth.', detail: '18px blur · substantial frost', winner: false },
  { id: 'edge', letter: 'B', name: 'Edge Light', idea: 'A lit instrument. Dark transparent body, precise rim, a quiet bloom.', detail: '12px blur · illuminated edge', winner: true },
  { id: 'liquid', letter: 'C', name: 'Liquid Fill', idea: 'A fluid capsule. Directional dodger tint slides beneath the light.', detail: '8px blur · shifting tint', winner: false },
] as const

function GlassMatrix({ size, context }: { size: 'sm' | 'md'; context: string }) {
  const [on, setOn] = useState(true)
  const [segment, setSegment] = useState('all')
  const [notice, setNotice] = useState('Try a control')
  const sizeClass = size === 'sm' ? 'ob-btn-sm' : ''
  return (
    <div className={styles.glassMatrix} aria-label={`${context} ${size} states`}>
      <h5 className={styles.matrixLabel}>{size} / states</h5>
      <div className={styles.glassControls}>
        {(['primary', 'ghost', 'danger', 'confirm'] as const).map(variant => (
          <Button key={variant} variant={variant} className={sizeClass} onClick={() => setNotice(`${variant} preview`)}>{variant}</Button>
        ))}
        <Button variant="ghost" className={sizeClass} active={on} onClick={() => setOn(!on)}>{on ? '✓ Active / on' : 'Active / off'}</Button>
        <Button variant="primary" className={sizeClass} loading>Loading</Button>
        <Button variant="ghost" className={sizeClass} disabled>Disabled</Button>
        <div className={styles.iconSample}>
          <IconButton aria-label={`${context} ${size}: add item`} onClick={() => setNotice('Icon action preview')}>+</IconButton>
          <span>Icon</span>
        </div>
      </div>
      <Segmented size={size} options={[{ value: 'all', label: 'All' }, { value: 'live', label: 'Live' }]} value={segment} onChange={setSegment} />
      <output className={styles.previewNotice} aria-live="polite">{notice}</output>
    </div>
  )
}

function GlassConcepts() {
  return (
    <section id="button-glass" className={styles.section}>
      <div className={styles.glassIntro}>
        <span className={styles.specimenName}>MATERIAL STUDY / 01</span>
        <h2 className={styles.glassTitle}>Commands that catch the light.</h2>
        <p>Three glass materials. One dodger accent. Compare the full state matrix on a panel and directly over the ambient rain.</p>
      </div>
      <div className={styles.conceptGrid}>
        {glassConcepts.map(concept => (
          <article key={concept.id} className={`${styles.concept} ${styles[concept.id]}`} aria-labelledby={`glass-${concept.id}`}>
            <header className={styles.conceptHead}>
              <span className={styles.conceptIndex}>{concept.letter} / {concept.winner ? 'Installed winner' : 'Concept'}</span>
              <h3 id={`glass-${concept.id}`}>{concept.name}</h3>
              <p>{concept.idea}</p>
              <span className={styles.conceptDetail}>{concept.detail}</span>
            </header>
            {(['panel', 'rain'] as const).map(surface => (
              <div key={surface} className={surface === 'panel' ? styles.panelStage : styles.rainStage}>
                <h4 className={styles.surfaceLabel}>{surface === 'panel' ? '01 / On a panel' : '02 / Over ambient rain'}</h4>
                {(['sm', 'md'] as const).map(size => <GlassMatrix key={size} size={size} context={`${concept.name}, ${surface}`} />)}
                <Button variant="ghost" href="#button-glass" className={styles.wideGlassLink}>All conversations ›</Button>
              </div>
            ))}
          </article>
        ))}
      </div>
      <p className={styles.glassVerdict}><strong>B · Edge Light is installed.</strong> Its dark body keeps labels clear, its rim carries the material at every width, and its depth survives the touch version without blur. Red and green are reserved for danger and confirmation. Touch keeps the gradients and rim; reduced motion removes transitions.</p>
    </section>
  )
}

export default function StyleGuide() {
  const [segment, setSegment] = useState('today')
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="~/styleguide · DECK-VOCABULARY"
        title="STYLEGUIDE"
        subtitle="OmniBridge tokens and shared component vocabulary"
        actions={<Button variant="ghost" href="#primitives">Components</Button>}
      />

      <p className={styles.intro}>The living contract for the one Mission Control visual language. Variant names sit beside each specimen so a contributor can choose the shared primitive before writing new UI.</p>

      <div id="primitives" className={styles.content}>
        <GlassConcepts />
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
            <Specimen name="IconButton · required aria-label"><IconButton aria-label="Open menu">☰</IconButton></Specimen>
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
