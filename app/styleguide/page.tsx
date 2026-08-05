'use client'

/**
 * STYLEGUIDE — renders every design token and component variant from the
 * single source of truth (lib/tokens.ts). This is the living spec: if a
 * token or variant isn't here, it isn't part of the system.
 *
 * No data-dependent components — this is a pure static specimen wall, so it
 * renders identically for every visitor.
 */
import { SectionHead } from '@/components/ui'
import {
  designTokens, SEMANTIC, CATEGORICAL, FONT, TYPE_SCALE, SPACING,
  RADIUS, GLOW, MOTION, DENSITY, ACCENT_DEFAULT,
} from '@/lib/tokens'

/* ---------- specimen helpers ---------- */

function Swatch({ name, color, ink }: { name: string; color: string; ink?: string }) {
  return (
    <div className="sg-swatch" style={{ background: color, color: ink ?? '#0a020c' }}>
      <span className="sg-swatch-name">{name}</span>
      <span className="sg-swatch-hex">{color}</span>
    </div>
  )
}

function TokenRow({ k, v, kind = 'raw' }: { k: string; v: string | number; kind?: 'raw' | 'css' }) {
  return (
    <div className="sg-row">
      <span className="sg-k">{k}</span>
      <code className="sg-v">{String(v)}</code>
      <span className="sg-kind">{kind}</span>
    </div>
  )
}

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <>
      <div id={id} className="sg-anchor" />
      <SectionHead label={label} />
      {children}
    </>
  )
}

function VariantCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sg-var">
      <div className="sg-var-title">{title}</div>
      <div className="sg-var-body">{children}</div>
    </div>
  )
}

/* ---------- component variant specimens (pure, data-free) ---------- */

function StatusSpecimens() {
  const tones = ['ok', 'warn', 'error', 'info'] as const
  return (
    <div className="sg-grid sg-grid--4">
      {tones.map(t => (
        <VariantCard key={t} title={`status · ${t}`}>
          <div className="sg-stack">
            <span className={`mc-hk-status ${t === 'ok' ? 'done' : t === 'warn' ? 'warn' : t === 'error' ? 'bad' : ''}`}>{t}</span>
            <span className={`mc-task-tag ${t}`}>tag · {t}</span>
            <span className={`mc-pipe-score ${t === 'ok' ? 'hi' : t === 'warn' ? 'mid' : 'lo'}`}>SCORE {t}</span>
          </div>
        </VariantCard>
      ))}
    </div>
  )
}

function TypeRoleSpecimens() {
  return (
    <div className="sg-stack sg-stack--lg">
      <VariantCard title="type · display (mono numerals) — hero values">
        <div className="sg-row"><span className="sg-k">--pt-font-display</span><span className="sg-v sg-display">42,918</span><span className="sg-kind">numbers stay mono</span></div>
      </VariantCard>
      <VariantCard title="type · micro (uppercase mono) — section headers & labels">
        <h3 className="sg-micro">SYSTEM PULSE / CRON FAILS / WORKING NOW</h3>
      </VariantCard>
      <VariantCard title="type · ui (Inter sans) — all prose & card content">
        <p className="sg-prose">This is body copy rendered in the UI sans. Long-form prose, card descriptions, and readable content all live here — never in uppercase mono. It reads soft against the phosphor labels above it.</p>
      </VariantCard>
    </div>
  )
}

function DensitySpecimens() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <VariantCard title="density · compact">
        <div style={{ padding: DENSITY.compact.py.slice(0, 2) + ' ' + DENSITY.compact.px, display: 'flex', flexDirection: 'column', gap: DENSITY.compact.gap, background: 'var(--pt-surface)', borderRadius: 'var(--pt-r-md)', border: '1px solid var(--pt-border-dim)' }}>
          <span className="mc-tcol-glyph">▤</span><span className="sg-k">COMPACT CARD</span><span className="sg-v">10px scale</span>
        </div>
      </VariantCard>
      <VariantCard title="density · expanded">
        <div style={{ padding: DENSITY.expanded.py.slice(0, 2) + ' ' + DENSITY.expanded.px, display: 'flex', flexDirection: 'column', gap: DENSITY.expanded.gap, background: 'var(--pt-surface-2)', borderRadius: 'var(--pt-r-lg)', border: '1px solid var(--pt-border)' }}>
          <span className="mc-tcol-glyph">▤</span><span className="sg-k">EXPANDED CARD</span><span className="sg-v">28px scale</span>
        </div>
      </VariantCard>
    </div>
  )
}

function ElevationSpecimens() {
  return (
    <div className="sg-grid sg-grid--3">
      <VariantCard title="surface · base">
        <div className="sg-elev" style={{ background: 'var(--pt-surface)' }}>--pt-surface</div>
      </VariantCard>
      <VariantCard title="surface · raised">
        <div className="sg-elev" style={{ background: 'var(--pt-surface-2)' }}>--pt-surface-2</div>
      </VariantCard>
      <VariantCard title="glow · two intensities">
        <div className="sg-elev" style={{ background: 'var(--pt-bg-soft)', boxShadow: 'var(--pt-glow-sm)' }}>--pt-glow-sm</div>
        <div className="sg-elev" style={{ background: 'var(--pt-bg-soft)', boxShadow: 'var(--pt-glow-md)' }}>--pt-glow-md</div>
      </VariantCard>
    </div>
  )
}

export default function StyleGuide() {
  return (
    <div className="sg">
      <SectionHead label="DESIGN SYSTEM / STYLEGUIDE" post={<span className="sg-count">source: lib/tokens.ts</span>} />

      <Section id="sg-color" label="COLOR · SEMANTIC + ONE ACCENT">
        <p className="sg-desc">One accent + four semantic states. Red is always semantic — never decorative. All four resolve through lib/tokens.ts.</p>
        <div className="sg-grid sg-grid--4">
          {Object.entries(SEMANTIC).map(([k, v]) => (
            <Swatch key={k} name={`semantic · ${k}`} color={v.hex} ink={v.ink} />
          ))}
        </div>
        <div className="sg-grid">
          <Swatch name={`accent (default)`} color={ACCENT_DEFAULT} ink="#fff" />
        </div>
        <p className="sg-desc sg-desc--dim">Categorical chart palette (not status) — fixed order, never cycled.</p>
        <div className="sg-grid sg-grid--8">
          {Object.entries(CATEGORICAL).filter(([k]) => !k.startsWith('seq')).map(([k, v]) => <Swatch key={k} name={k} color={v} ink="#fff" />)}
        </div>
        <div className="sg-grid sg-grid--8">
          {Object.entries(CATEGORICAL).filter(([k]) => k.startsWith('seq')).map(([k, v]) => <Swatch key={k} name={k} color={v} ink="#fff" />)}
        </div>
      </Section>

      <Section id="sg-type" label="TYPE · THREE ROLES">
        <TypeRoleSpecimens />
        <div className="sg-subhead">scale</div>
        <div className="sg-rows">
          {Object.entries(TYPE_SCALE).map(([k, v]) => <TokenRow key={k} k={`--pt-fs-${k}`} v={v} kind="css" />)}
        </div>
        <div className="sg-subhead">families</div>
        <div className="sg-rows">
          <TokenRow k="--pt-font-sans (prose)" v="Inter (loaded via next/font)" />
          <TokenRow k="--pt-font-mono / display" v={FONT.mono} />
        </div>
      </Section>

      <Section id="sg-space" label="SPACING · 8px SCALE / RADIUS / BORDER">
        <div className="sg-grid sg-grid--11">
          {Object.entries(SPACING).map(([k, v]) => (
            <div key={k} className="sg-space">
              <div className="sg-space-bar" style={{ height: 6, width: v }} />
              <span>{k}</span>
            </div>
          ))}
        </div>
        <div className="sg-subhead">radius · one family</div>
        <div className="sg-grid sg-grid--4">
          {Object.entries(RADIUS).map(([k, v]) => (
            <div key={k} className="sg-radius" style={{ borderRadius: v }}><span>{k}</span></div>
          ))}
        </div>
      </Section>

      <Section id="sg-surface" label="SURFACES · TWO ELEVATIONS / GLOW">
        <ElevationSpecimens />
        <div className="sg-rows">
          {Object.entries(GLOW).map(([k, v]) => <TokenRow key={k} k={`--pt-glow-${k}`} v={v} kind="css" />)}
        </div>
      </Section>

      <Section id="sg-motion" label="MOTION · DURATIONS + EASING">
        <div className="sg-rows">
          {Object.entries(MOTION).map(([k, v]) => <TokenRow key={k} k={`motion.${k}`} v={v} />)}
        </div>
        <p className="sg-desc">Consumed by Phase 2 (Motion Tokens). Never linear except continuous loops. Animate transform & opacity only.</p>
      </Section>

      <Section id="sg-density" label="DENSITY · COMPACT + EXPANDED">
        <DensitySpecimens />
      </Section>

      <Section id="sg-components" label="COMPONENT VARIANTS">
        <StatusSpecimens />
      </Section>
    </div>
  )
}
