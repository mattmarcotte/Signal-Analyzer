import React, { useCallback, useRef, useState, useEffect } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { Upload, Loader2, Activity, BarChart2, Gauge, Waveform } from 'lucide-react'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { AudioPlayer } from './components/AudioPlayer'
import { EffectsPanel } from './components/EffectsPanel'

const API_URL = import.meta.env.VITE_API_URL || ''

function fmt2(n) {
  return typeof n === 'number' ? n.toFixed(2) : '—'
}

function formatHz(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(2)} kHz`
  return `${hz.toFixed(2)} Hz`
}

function StatCard({ label, value, unit, highlight }) {
  return (
    <div className={`rounded-lg border p-4 flex flex-col gap-1 ${
      highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
    }`}>
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-semibold text-foreground tabular-nums">{fmt2(value)}</span>
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  )
}

function FFTTab({ data }) {
  if (!data) return null
  const chartData = data.frequencies.map((f, i) => ({
    freq: parseFloat(f.toFixed(2)),
    magnitude: data.magnitudes[i],
  }))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Peak frequency:</span>
        <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          {formatHz(data.peak_frequency)}
        </span>
        <span className="text-sm text-muted-foreground">Sample rate: {data.sample_rate.toLocaleString()} Hz</span>
      </div>
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 28 }}>
            <defs>
              <linearGradient id="fftGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="freq" type="number" domain={['auto', 'auto']}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
              label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -18, fontSize: 12 }}
              tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
            />
            <YAxis
              label={{ value: 'Magnitude', angle: -90, position: 'insideLeft', offset: 8, fontSize: 12 }}
              tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
              tickFormatter={(v) => v.toExponential(1)}
            />
            <Tooltip
              formatter={(v) => [v.toExponential(4), 'Magnitude']}
              labelFormatter={(l) => `${parseFloat(l).toFixed(1)} Hz`}
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: 12 }}
            />
            <Area type="monotone" dataKey="magnitude" stroke="#6366f1" strokeWidth={1.5} fill="url(#fftGrad)" dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function SpectrogramTab({ data }) {
  if (!data) return null
  return (
    <div className="space-y-3">
      <img
        src={`data:image/png;base64,${data.image_base64}`}
        alt="Spectrogram"
        className="w-full rounded-lg border border-border"
      />
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span>Duration: <strong className="text-foreground">{data.duration_seconds.toFixed(3)} s</strong></span>
        <span>Time bins: <strong className="text-foreground">{data.time_bins}</strong></span>
        <span>Frequency bins: <strong className="text-foreground">{data.freq_bins}</strong></span>
      </div>
    </div>
  )
}

function SNRTab({ data }) {
  if (!data) return null
  const snrGood = data.snr_db > 20
  return (
    <div className="space-y-4">
      <div className={`rounded-lg px-4 py-3 text-sm border ${
        snrGood
          ? 'bg-green-50 border-green-200 text-green-800'
          : 'bg-yellow-50 border-yellow-200 text-yellow-800'
      }`}>
        {snrGood
          ? `Good SNR (${data.snr_db.toFixed(1)} dB) — signal is well-separated from noise.`
          : `Low SNR (${data.snr_db.toFixed(1)} dB) — the signal may be noisy or broadband.`}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="SNR" value={data.snr_db} unit="dB" highlight />
        <StatCard label="Signal Power" value={data.signal_power_db} unit="dB" />
        <StatCard label="Noise Power" value={data.noise_power_db} unit="dB" />
        <StatCard label="Peak Frequency" value={data.peak_frequency} unit="Hz" />
        <StatCard label="Bandwidth" value={data.bandwidth_hz} unit="Hz" />
      </div>
    </div>
  )
}

export default function App() {
  const [file, setFile] = useState(null)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef(null)

  const player = useAudioPlayer()

  const handleFile = useCallback((f) => {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['wav', 'mp3', 'csv'].includes(ext)) {
      setError('Only .wav, .mp3, and .csv files are supported.')
      return
    }
    setFile(f)
    setResults(null)
    setError(null)
    // Load into audio player if it's an audio file
    if (ext === 'wav' || ext === 'mp3') {
      player.loadFile(f)
    }
  }, [player.loadFile])

  const onInputChange = (e) => handleFile(e.target.files?.[0])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  const analyze = async () => {
    if (!file || loading) return
    setLoading(true)
    setError(null)
    setResults(null)
    const makeFormData = () => { const fd = new FormData(); fd.append('file', file); return fd }
    try {
      const [fftRes, spectRes, snrRes] = await Promise.all([
        fetch(`${API_URL}/analyze/fft`, { method: 'POST', body: makeFormData() }),
        fetch(`${API_URL}/analyze/spectrogram`, { method: 'POST', body: makeFormData() }),
        fetch(`${API_URL}/analyze/snr`, { method: 'POST', body: makeFormData() }),
      ])
      const parseOrThrow = async (res, label) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(`${label}: ${body.detail || res.statusText}`)
        }
        return res.json()
      }
      const [fft, spectrogram, snr] = await Promise.all([
        parseOrThrow(fftRes, 'FFT'),
        parseOrThrow(spectRes, 'Spectrogram'),
        parseOrThrow(snrRes, 'SNR'),
      ])
      setResults({ fft, spectrogram, snr })
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const isAudioFile = file && ['wav', 'mp3'].includes(file.name.split('.').pop().toLowerCase())

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Signal Analyzer</h1>
          <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">v1.0.0</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Upload */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Upload Signal File</h2>
          <div
            className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
          >
            <input ref={fileInputRef} type="file" accept=".wav,.mp3,.csv" className="hidden" onChange={onInputChange} />
            <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            {file ? (
              <div>
                <p className="font-medium text-foreground">{file.name}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {(file.size / 1024).toFixed(1)} KB — click or drop to replace
                </p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-foreground">Drop a file here, or click to browse</p>
                <p className="text-sm text-muted-foreground mt-1">Supports .wav, .mp3, and .csv (max 20 MB)</p>
              </div>
            )}
          </div>
        </section>

        {/* Player + Effects — shown when an audio file is loaded */}
        {isAudioFile && player.audioBuffer && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Audio</h2>
              <AudioPlayer
                isPlaying={player.isPlaying}
                currentTime={player.currentTime}
                duration={player.duration}
                volume={player.volume}
                onPlay={player.play}
                onPause={player.pause}
                onStop={player.stop}
                onSeek={player.seek}
                onVolumeChange={player.changeVolume}
              />
              {player.loadError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {player.loadError}
                </div>
              )}
            </div>
            <div className="space-y-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Signal Processing</h2>
              <EffectsPanel
                filters={player.filters}
                pitchSemitones={player.pitchSemitones}
                onToggleFilter={player.toggleFilter}
                onUpdateFilter={player.updateFilter}
                onPitchChange={player.setPitchSemitones}
                onReset={player.resetFilters}
              />
            </div>
          </section>
        )}

        {/* Analyze button + error */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <button
            onClick={analyze}
            disabled={!file || loading}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors ${
              !file || loading
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {loading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</>
            ) : (
              <><BarChart2 className="h-4 w-4" />Analyze</>
            )}
          </button>

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              <strong>Error: </strong>{error}
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <section className="space-y-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Analysis Results</h2>
            <Tabs.Root defaultValue="fft" className="space-y-4">
              <Tabs.List className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
                {[
                  { value: 'fft', label: 'FFT Spectrum', Icon: Activity },
                  { value: 'spectrogram', label: 'Spectrogram', Icon: Gauge },
                  { value: 'snr', label: 'SNR', Icon: BarChart2 },
                ].map(({ value, label, Icon }) => (
                  <Tabs.Trigger
                    key={value}
                    value={value}
                    className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm hover:text-foreground"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              <div className="rounded-xl border border-border bg-card p-6">
                <Tabs.Content value="fft"><FFTTab data={results.fft} /></Tabs.Content>
                <Tabs.Content value="spectrogram"><SpectrogramTab data={results.spectrogram} /></Tabs.Content>
                <Tabs.Content value="snr"><SNRTab data={results.snr} /></Tabs.Content>
              </div>
            </Tabs.Root>
          </section>
        )}
      </main>
    </div>
  )
}
