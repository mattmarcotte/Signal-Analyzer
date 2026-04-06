import React, { useRef, useState, useEffect } from 'react'
import { RotateCcw, Music } from 'lucide-react'

// ── Log-scale frequency helpers ───────────────────────────────────────────────

const LOG_MIN = Math.log10(20)
const LOG_MAX = Math.log10(20000)

function freqToRatio(freq) {
  return (Math.log10(Math.max(20, Math.min(20000, freq))) - LOG_MIN) / (LOG_MAX - LOG_MIN)
}

function ratioToFreq(ratio) {
  return Math.round(Math.pow(10, Math.max(0, Math.min(1, ratio)) * (LOG_MAX - LOG_MIN) + LOG_MIN))
}

function fmtHz(hz) {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}`
}

const MARKERS = [50, 100, 200, 500, 1000, 2000, 5000, 10000]

// ── FreqInput — local state so typing isn't interrupted by controlled value ───

function FreqInput({ value, min, max, onChange }) {
  const [local, setLocal] = useState(String(Math.round(value)))

  // Sync when the external value changes (e.g. from dragging the handle)
  useEffect(() => {
    setLocal(String(Math.round(value)))
  }, [value])

  const commit = () => {
    const parsed = parseInt(local, 10)
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      onChange(parsed)
    } else {
      setLocal(String(Math.round(value))) // revert to last valid
    }
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )
}

// ── BandSelector ──────────────────────────────────────────────────────────────

function BandSelector({ low, high, type, onChange }) {
  const barRef = useRef(null)
  const dragRef = useRef(null)

  const lowRatio  = freqToRatio(low)
  const highRatio = freqToRatio(high)
  const isBandPass = type === 'bandpass'

  const bandBg     = isBandPass ? 'bg-emerald-500/20' : 'bg-red-500/20'
  const bandBorder = isBandPass ? 'border-emerald-500/70' : 'border-red-500/70'
  const handleBg   = isBandPass ? 'bg-emerald-500' : 'bg-red-500'

  const startDrag = (e, mode) => {
    e.preventDefault()
    const rect = barRef.current.getBoundingClientRect()
    dragRef.current = { mode, startX: e.clientX, startLow: low, startHigh: high, rect }

    const move = (ev) => {
      if (!dragRef.current) return
      const { mode, startX, startLow, startHigh, rect } = dragRef.current
      const rawRatio = (ev.clientX - rect.left) / rect.width

      if (mode === 'left') {
        const newLow = ratioToFreq(rawRatio)
        onChange({ low: Math.min(newLow, high - 10), high })
      } else if (mode === 'right') {
        const newHigh = ratioToFreq(rawRatio)
        onChange({ low, high: Math.max(newHigh, low + 10) })
      } else {
        const delta = (ev.clientX - startX) / rect.width
        const startLowRatio  = freqToRatio(startLow)
        const startHighRatio = freqToRatio(startHigh)
        const width = startHighRatio - startLowRatio
        let newLowRatio = startLowRatio + delta
        let newHighRatio = newLowRatio + width
        if (newLowRatio < 0)  { newLowRatio = 0; newHighRatio = width }
        if (newHighRatio > 1) { newHighRatio = 1; newLowRatio = 1 - width }
        onChange({ low: ratioToFreq(newLowRatio), high: ratioToFreq(newHighRatio) })
      }
    }

    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="space-y-3 select-none">
      {/* Bar */}
      <div
        ref={barRef}
        className="relative h-16 bg-muted rounded-lg overflow-visible cursor-crosshair"
      >
        {/* Tick marks */}
        {MARKERS.map(hz => (
          <div
            key={hz}
            className="absolute top-0 bottom-0 w-px bg-border/60 pointer-events-none"
            style={{ left: `${freqToRatio(hz) * 100}%` }}
          />
        ))}

        {/* Highlighted band */}
        <div
          className={`absolute top-0 bottom-0 border-x-2 ${bandBg} ${bandBorder} cursor-grab active:cursor-grabbing`}
          style={{ left: `${lowRatio * 100}%`, right: `${(1 - highRatio) * 100}%` }}
          onPointerDown={(e) => startDrag(e, 'band')}
        />

        {/* Left handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-10 ${handleBg} rounded cursor-ew-resize z-10 shadow-md`}
          style={{ left: `${lowRatio * 100}%` }}
          onPointerDown={(e) => startDrag(e, 'left')}
        />

        {/* Right handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-10 ${handleBg} rounded cursor-ew-resize z-10 shadow-md`}
          style={{ left: `${highRatio * 100}%` }}
          onPointerDown={(e) => startDrag(e, 'right')}
        />
      </div>

      {/* Frequency axis labels */}
      <div className="relative h-4 pointer-events-none">
        {MARKERS.map(hz => (
          <span
            key={hz}
            className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
            style={{ left: `${freqToRatio(hz) * 100}%` }}
          >
            {fmtHz(hz)}
          </span>
        ))}
      </div>

      {/* Text inputs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Low cutoff</label>
          <div className="flex items-center gap-1.5">
            <FreqInput
              value={low}
              min={20}
              max={high - 10}
              onChange={(val) => onChange({ low: val, high })}
            />
            <span className="text-xs text-muted-foreground shrink-0">Hz</span>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">High cutoff</label>
          <div className="flex items-center gap-1.5">
            <FreqInput
              value={high}
              min={low + 10}
              max={20000}
              onChange={(val) => onChange({ low, high: val })}
            />
            <span className="text-xs text-muted-foreground shrink-0">Hz</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <p className="text-xs text-muted-foreground">
        Bandwidth: <span className="font-mono text-foreground">{fmtHz(high - low)} Hz</span>
        {' · '}
        Center: <span className="font-mono text-foreground">{fmtHz(Math.sqrt(low * high))} Hz</span>
      </p>
    </div>
  )
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
        enabled ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform ${
        enabled ? 'translate-x-4' : 'translate-x-0'
      }`} />
    </button>
  )
}

// ── FilterCard ────────────────────────────────────────────────────────────────

function FilterCard({ filter, onToggle, onUpdate, compact }) {
  const isBandStyle = filter.low !== undefined && filter.high !== undefined
  const hasGain = filter.gain !== undefined

  return (
    <div className={`rounded-lg border transition-colors ${
      filter.enabled ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
    } ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between">
        <div className="min-w-0 mr-3">
          <span className="text-sm font-semibold text-foreground">{filter.label}</span>
          <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{filter.description}</p>
        </div>
        <Toggle enabled={filter.enabled} onToggle={() => onToggle(filter.id)} />
      </div>

      {filter.enabled && (
        <div className="mt-3 space-y-3">
          {isBandStyle ? (
            <BandSelector
              low={filter.low}
              high={filter.high}
              type={filter.type}
              onChange={(updates) => onUpdate(filter.id, updates)}
            />
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Cutoff Frequency</label>
                  <span className="text-xs font-mono text-foreground">
                    {filter.frequency >= 1000
                      ? `${(filter.frequency / 1000).toFixed(1)} kHz`
                      : `${filter.frequency} Hz`}
                  </span>
                </div>
                <input
                  type="range" min="20" max="20000" step="10"
                  value={filter.frequency}
                  onChange={(e) => onUpdate(filter.id, { frequency: parseInt(e.target.value) })}
                  className="w-full accent-primary"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted-foreground">Q (Resonance)</label>
                  <span className="text-xs font-mono text-foreground">{filter.Q.toFixed(1)}</span>
                </div>
                <input
                  type="range" min="0.1" max="20" step="0.1"
                  value={filter.Q}
                  onChange={(e) => onUpdate(filter.id, { Q: parseFloat(e.target.value) })}
                  className="w-full accent-primary"
                />
              </div>
              {hasGain && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-muted-foreground">Gain</label>
                    <span className="text-xs font-mono text-foreground">
                      {filter.gain > 0 ? '+' : ''}{filter.gain} dB
                    </span>
                  </div>
                  <input
                    type="range" min="-24" max="24" step="0.5"
                    value={filter.gain}
                    onChange={(e) => onUpdate(filter.id, { gain: parseFloat(e.target.value) })}
                    className="w-full accent-primary"
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── EffectsPanel ──────────────────────────────────────────────────────────────

export function EffectsPanel({ filters, pitchSemitones, onToggleFilter, onUpdateFilter, onPitchChange, onReset }) {
  const activeCount = filters.filter(f => f.enabled).length

  const simpleFilters = filters.filter(f => f.low === undefined && f.id !== 'peaking')
  const bandFilters   = filters.filter(f => f.low !== undefined)
  const peaking       = filters.find(f => f.id === 'peaking')

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Effects</span>
          {activeCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {activeCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">Changes apply on next play.</p>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Simple filters: Low Pass + High Pass side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {simpleFilters.map(filter => (
          <FilterCard key={filter.id} filter={filter} onToggle={onToggleFilter} onUpdate={onUpdateFilter} />
        ))}
      </div>

      {/* Band filters: each full width so selector has max room */}
      <div className="space-y-3">
        {bandFilters.map(filter => (
          <FilterCard key={filter.id} filter={filter} onToggle={onToggleFilter} onUpdate={onUpdateFilter} />
        ))}
      </div>

      {/* Peaking EQ + Pitch side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
        {peaking && (
          <FilterCard filter={peaking} onToggle={onToggleFilter} onUpdate={onUpdateFilter} />
        )}

        {/* Pitch */}
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Pitch & Speed</span>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">Shifts pitch and playback speed together.</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Semitones</span>
              <span className="text-xs font-mono text-foreground">
                {pitchSemitones > 0 ? '+' : ''}{pitchSemitones}
              </span>
            </div>
            <input
              type="range" min="-24" max="24" step="1"
              value={pitchSemitones}
              onChange={(e) => onPitchChange(parseInt(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>-24</span><span>0</span><span>+24</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
