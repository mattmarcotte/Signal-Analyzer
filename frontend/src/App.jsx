import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import {
  Upload, Loader2, Activity, BarChart2, Gauge,
  Moon, Sun, AudioWaveform, GitCompare,
} from 'lucide-react'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { AudioPlayer } from './components/AudioPlayer'
import { EffectsPanel } from './components/EffectsPanel'

const API_URL = import.meta.env.VITE_API_URL || ''

// ── WAV encoder ───────────────────────────────────────────────────────────────

function audioBufferToWav(buffer) {
  const samples = buffer.getChannelData(0)
  const sampleRate = buffer.sampleRate
  const wavBuf = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(wavBuf)
  const str = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE'); str(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  str(36, 'data'); view.setUint32(40, samples.length * 2, true)
  let off = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
    off += 2
  }
  return new Blob([wavBuf], { type: 'audio/wav' })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n) { return typeof n === 'number' ? n.toFixed(2) : '—' }
function formatHz(hz) {
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz.toFixed(2)} Hz`
}

const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: 12,
}
const AXIS_PROPS = { tick: { fontSize: 11 }, stroke: 'hsl(var(--muted-foreground))' }

// ── View-mode toggle button ───────────────────────────────────────────────────

function ViewToggle({ label, Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-primary/40'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

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

// ── Waveform tab ──────────────────────────────────────────────────────────────

function WaveformTab({ audioBuffer, currentTime }) {
  const data = useMemo(() => {
    if (!audioBuffer) return []
    const samples = audioBuffer.getChannelData(0)
    const step = Math.max(1, Math.floor(samples.length / 3000))
    const out = []
    for (let i = 0; i < samples.length; i += step) {
      out.push({
        time: parseFloat((i / audioBuffer.sampleRate).toFixed(4)),
        amplitude: parseFloat(samples[i].toFixed(5)),
      })
    }
    return out
  }, [audioBuffer])

  return (
    <div className="space-y-2">
      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 28 }}>
            <defs>
              <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="time" type="number" domain={['dataMin', 'dataMax']}
              tickFormatter={(v) => `${v.toFixed(1)}s`}
              label={{ value: 'Time (s)', position: 'insideBottom', offset: -18, fontSize: 12 }}
              {...AXIS_PROPS}
            />
            <YAxis
              domain={[-1, 1]}
              label={{ value: 'Amplitude', angle: -90, position: 'insideLeft', offset: 8, fontSize: 12 }}
              {...AXIS_PROPS}
            />
            <Tooltip
              formatter={(v) => [v.toFixed(4), 'Amplitude']}
              labelFormatter={(l) => `${parseFloat(l).toFixed(3)} s`}
              contentStyle={TOOLTIP_STYLE}
            />
            <ReferenceLine
              x={currentTime}
              stroke="#6366f1"
              strokeWidth={2}
              strokeDasharray="4 2"
            />
            <Area
              type="monotone" dataKey="amplitude"
              stroke="#6366f1" strokeWidth={1}
              fill="url(#waveGrad)" dot={false} isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Dashed line tracks current playback position.
      </p>
    </div>
  )
}

// ── FFT tab (supports optional A/B overlay) ───────────────────────────────────

function FFTTab({ data, dataB }) {
  if (!data) return null

  const chartDataA = data.frequencies.map((f, i) => ({ freq: f, magA: data.magnitudes[i] }))
  const chartDataB = dataB?.frequencies.map((f, i) => ({ freq: f, magB: dataB.magnitudes[i] }))
  const maxFreq = Math.max(
    data.frequencies.at(-1) ?? 0,
    dataB?.frequencies.at(-1) ?? 0,
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{dataB ? 'Peak (A):' : 'Peak frequency:'}</span>
        <span className="inline-flex items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          {formatHz(data.peak_frequency)}
        </span>
        {dataB && (
          <>
            <span className="text-sm text-muted-foreground">Peak (B):</span>
            <span className="inline-flex items-center rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white">
              {formatHz(dataB.peak_frequency)}
            </span>
          </>
        )}
        <span className="text-sm text-muted-foreground">
          Sample rate: {data.sample_rate.toLocaleString()} Hz
        </span>
      </div>

      <div className="w-full h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 8, right: 16, left: 8, bottom: 28 }}>
            <defs>
              <linearGradient id="fftGradA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fftGradB" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number" dataKey="freq" domain={[0, maxFreq]}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
              label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -18, fontSize: 12 }}
              allowDataOverflow
              {...AXIS_PROPS}
            />
            <YAxis
              label={{ value: 'Magnitude', angle: -90, position: 'insideLeft', offset: 8, fontSize: 12 }}
              tickFormatter={(v) => v.toExponential(1)}
              {...AXIS_PROPS}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(l) => `${parseFloat(l).toFixed(1)} Hz`}
            />
            {dataB && <Legend verticalAlign="top" align="right" height={28} />}

            <Area
              data={chartDataA}
              type="monotone" dataKey="magA" name="File A"
              stroke="#6366f1" strokeWidth={1.5}
              fill="url(#fftGradA)" dot={false} isAnimationActive={false}
            />
            {dataB && (
              <Area
                data={chartDataB}
                type="monotone" dataKey="magB" name="File B"
                stroke="#f59e0b" strokeWidth={1.5}
                fill="url(#fftGradB)" dot={false} isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Spectrogram tab ───────────────────────────────────────────────────────────

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

// ── SNR tab ───────────────────────────────────────────────────────────────────

function SNRTab({ data }) {
  if (!data) return null
  const snrGood = data.snr_db > 20
  return (
    <div className="space-y-4">
      <div className={`rounded-lg px-4 py-3 text-sm border ${
        snrGood
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300'
          : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300'
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

// ── Compact drop zone for File B ──────────────────────────────────────────────

function FileBDropZone({ fileB, onFile }) {
  const [dragging, setDragging] = useState(false)
  const ref = useRef(null)
  const VALID = ['wav', 'mp3', 'csv']

  const handle = (f) => {
    if (!f) return
    if (!VALID.includes(f.name.split('.').pop().toLowerCase())) return
    onFile(f)
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
        dragging ? 'border-amber-400 bg-amber-500/5' : 'border-border hover:border-amber-400/50 hover:bg-muted/30'
      }`}
      onClick={() => ref.current?.click()}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files?.[0]) }}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
    >
      <input ref={ref} type="file" accept=".wav,.mp3,.csv" className="hidden"
        onChange={(e) => handle(e.target.files?.[0])} />
      <Upload className="mx-auto h-5 w-5 text-muted-foreground mb-2" />
      {fileB ? (
        <div>
          <p className="text-sm font-medium text-foreground">{fileB.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{(fileB.size / 1024).toFixed(1)} KB — click to replace</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-foreground">Drop File B here</p>
          <p className="text-xs text-muted-foreground mt-0.5">The comparison signal</p>
        </div>
      )}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [file, setFile] = useState(null)
  const [results, setResults] = useState(null)
  const [filteredAnalysis, setFilteredAnalysis] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true')

  // View modes
  const [showWaveform, setShowWaveform] = useState(false)
  const [showABCompare, setShowABCompare] = useState(false)
  const [fileB, setFileB] = useState(null)
  const [resultsB, setResultsB] = useState(null)

  const fileInputRef = useRef(null)
  const player = useAudioPlayer()

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('darkMode', darkMode)
  }, [darkMode])

  // Reset B when A/B mode is turned off
  useEffect(() => {
    if (!showABCompare) { setFileB(null); setResultsB(null) }
  }, [showABCompare])

  const handleFile = useCallback((f) => {
    if (!f) return
    const ext = f.name.split('.').pop().toLowerCase()
    if (!['wav', 'mp3', 'csv'].includes(ext)) {
      setError('Only .wav, .mp3, and .csv files are supported.')
      return
    }
    setFile(f)
    setResults(null)
    setResultsB(null)
    setError(null)
    if (ext === 'wav' || ext === 'mp3') player.loadFile(f)
  }, [player.loadFile])

  const onInputChange = (e) => handleFile(e.target.files?.[0])
  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  const analyze = async () => {
    if (!file || loading) return
    setLoading(true)
    setError(null)
    setResults(null)
    setResultsB(null)
    setFilteredAnalysis(false)

    // Render filtered audio if effects are active
    let analysisFile = file
    const hasEffects = player.filters.some(f => f.enabled) || player.pitchSemitones !== 0
    if (hasEffects && player.audioBuffer) {
      try {
        const rendered = await player.renderFiltered()
        if (rendered) {
          analysisFile = new File([audioBufferToWav(rendered)], 'filtered.wav', { type: 'audio/wav' })
          setFilteredAnalysis(true)
        }
      } catch (err) {
        console.warn('Could not render filtered audio, falling back to original:', err)
      }
    }

    const makeFd = (f) => { const fd = new FormData(); fd.append('file', f); return fd }

    const parseOrThrow = async (res, label) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(`${label}: ${body.detail || res.statusText}`)
      }
      return res.json()
    }

    try {
      // Always run full analysis on File A; optionally run FFT-only on File B
      const requests = [
        fetch(`${API_URL}/analyze/fft`,         { method: 'POST', body: makeFd(analysisFile) }),
        fetch(`${API_URL}/analyze/spectrogram`,  { method: 'POST', body: makeFd(analysisFile) }),
        fetch(`${API_URL}/analyze/snr`,          { method: 'POST', body: makeFd(analysisFile) }),
        ...(showABCompare && fileB
          ? [fetch(`${API_URL}/analyze/fft`, { method: 'POST', body: makeFd(fileB) })]
          : []),
      ]

      const responses = await Promise.all(requests)
      const [fftRes, spectRes, snrRes, fftBRes] = responses

      const [fft, spectrogram, snr] = await Promise.all([
        parseOrThrow(fftRes, 'FFT'),
        parseOrThrow(spectRes, 'Spectrogram'),
        parseOrThrow(snrRes, 'SNR'),
      ])
      setResults({ fft, spectrogram, snr })

      if (fftBRes) {
        const fftB = await parseOrThrow(fftBRes, 'FFT (B)')
        setResultsB({ fft: fftB })
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const isAudioFile = file && ['wav', 'mp3'].includes(file.name.split('.').pop().toLowerCase())

  // Build tab list dynamically
  const tabs = [
    ...(showWaveform && isAudioFile && player.audioBuffer
      ? [{ value: 'waveform', label: 'Waveform', Icon: AudioWaveform }]
      : []),
    { value: 'fft', label: 'FFT Spectrum', Icon: Activity },
    { value: 'spectrogram', label: 'Spectrogram', Icon: Gauge },
    { value: 'snr', label: 'SNR', Icon: BarChart2 },
  ]

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold tracking-tight">Signal Analyzer</h1>
          <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2 py-0.5">v1.0.0</span>
          <button
            onClick={() => setDarkMode(d => !d)}
            className="ml-auto inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
            title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">

        {/* Upload — File A (and optional File B) */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Upload Signal File</h2>
          <div className={`grid gap-4 ${showABCompare ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
            {/* File A */}
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
              {showABCompare && (
                <p className="text-xs font-semibold text-primary mb-1 uppercase tracking-wide">File A</p>
              )}
              {file ? (
                <div>
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB — click or drop to replace</p>
                </div>
              ) : (
                <div>
                  <p className="font-medium text-foreground">Drop a file here, or click to browse</p>
                  <p className="text-sm text-muted-foreground mt-1">Supports .wav, .mp3, and .csv (max 20 MB)</p>
                </div>
              )}
            </div>

            {/* File B — only when A/B mode is on */}
            {showABCompare && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-amber-500 uppercase tracking-wide text-center">File B</p>
                <FileBDropZone fileB={fileB} onFile={setFileB} />
              </div>
            )}
          </div>
        </section>

        {/* Player + Effects */}
        {isAudioFile && player.audioBuffer && (
          <section className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
            <div className="space-y-3">
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
            <div className="space-y-3">
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

        {/* Analyze row — button + view-mode toggles + error */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={analyze}
            disabled={!file || loading}
            className={`inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-colors ${
              !file || loading
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</>
              : <><BarChart2 className="h-4 w-4" />Analyze</>}
          </button>

          <div className="flex items-center gap-2 border-l border-border pl-3">
            <ViewToggle
              label="Waveform"
              Icon={AudioWaveform}
              active={showWaveform}
              onClick={() => setShowWaveform(v => !v)}
            />
            <ViewToggle
              label="A/B Compare"
              Icon={GitCompare}
              active={showABCompare}
              onClick={() => setShowABCompare(v => !v)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              <strong>Error: </strong>{error}
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Analysis Results</h2>
              {filteredAnalysis && (
                <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                  Filtered signal
                </span>
              )}
              {resultsB && (
                <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                  A/B comparison — FFT overlay active
                </span>
              )}
            </div>

            <Tabs.Root defaultValue={showWaveform && isAudioFile ? 'waveform' : 'fft'} className="space-y-4">
              <Tabs.List className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
                {tabs.map(({ value, label, Icon }) => (
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
                {showWaveform && isAudioFile && player.audioBuffer && (
                  <Tabs.Content value="waveform">
                    <WaveformTab audioBuffer={player.audioBuffer} currentTime={player.currentTime} />
                  </Tabs.Content>
                )}
                <Tabs.Content value="fft">
                  <FFTTab data={results.fft} dataB={resultsB?.fft} />
                </Tabs.Content>
                <Tabs.Content value="spectrogram">
                  <SpectrogramTab data={results.spectrogram} />
                </Tabs.Content>
                <Tabs.Content value="snr">
                  <SNRTab data={results.snr} />
                </Tabs.Content>
              </div>
            </Tabs.Root>
          </section>
        )}
      </main>
    </div>
  )
}
