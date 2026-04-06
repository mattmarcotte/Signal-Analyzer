import React from 'react'
import { RotateCcw, Music } from 'lucide-react'

function FilterCard({ filter, onToggle, onUpdate }) {
  const hasGain = filter.gain !== undefined

  return (
    <div className={`rounded-lg border p-4 space-y-3 transition-colors ${
      filter.enabled
        ? 'border-primary/50 bg-primary/5'
        : 'border-border bg-card'
    }`}>
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-foreground">{filter.label}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{filter.description}</p>
        </div>
        <button
          onClick={() => onToggle(filter.id)}
          className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer ${
            filter.enabled ? 'bg-primary' : 'bg-muted'
          }`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform ${
            filter.enabled ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {filter.enabled && (
        <div className="space-y-2 pt-1">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                {filter.type === 'bandpass' ? 'Center' : 'Cutoff'} Frequency
              </label>
              <span className="text-xs font-mono text-foreground">
                {filter.frequency >= 1000
                  ? `${(filter.frequency / 1000).toFixed(1)} kHz`
                  : `${filter.frequency} Hz`}
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="20000"
              step="10"
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
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              value={filter.Q}
              onChange={(e) => onUpdate(filter.id, { Q: parseFloat(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>

          {hasGain && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Gain</label>
                <span className="text-xs font-mono text-foreground">{filter.gain > 0 ? '+' : ''}{filter.gain} dB</span>
              </div>
              <input
                type="range"
                min="-24"
                max="24"
                step="0.5"
                value={filter.gain}
                onChange={(e) => onUpdate(filter.id, { gain: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function EffectsPanel({ filters, pitchSemitones, onToggleFilter, onUpdateFilter, onPitchChange, onReset }) {
  const activeCount = filters.filter(f => f.enabled).length

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Effects</span>
          {activeCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {activeCount} active
            </span>
          )}
        </div>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">
        Changes apply on next play.
      </p>

      {/* Filters */}
      <div className="space-y-2">
        {filters.map(filter => (
          <FilterCard
            key={filter.id}
            filter={filter}
            onToggle={onToggleFilter}
            onUpdate={onUpdateFilter}
          />
        ))}
      </div>

      {/* Pitch */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Pitch & Speed</span>
        </div>
        <p className="text-xs text-muted-foreground">Shifts pitch and playback speed together (semitones).</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Semitones</span>
            <span className="text-xs font-mono text-foreground">
              {pitchSemitones > 0 ? '+' : ''}{pitchSemitones}
            </span>
          </div>
          <input
            type="range"
            min="-24"
            max="24"
            step="1"
            value={pitchSemitones}
            onChange={(e) => onPitchChange(parseInt(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>-24</span>
            <span>0</span>
            <span>+24</span>
          </div>
        </div>
      </div>
    </div>
  )
}
