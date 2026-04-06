import { useState, useRef, useCallback, useEffect } from 'react'

export const DEFAULT_FILTERS = [
  { id: 'lowpass',  label: 'Low Pass',  type: 'lowpass',  frequency: 2000, Q: 1,  enabled: false, description: 'Cuts frequencies above the cutoff' },
  { id: 'highpass', label: 'High Pass', type: 'highpass', frequency: 500,  Q: 1,  enabled: false, description: 'Cuts frequencies below the cutoff' },
  { id: 'bandpass', label: 'Band Pass', type: 'bandpass', frequency: 1000, Q: 2,  enabled: false, description: 'Passes a band around the center frequency' },
  { id: 'notch',    label: 'Notch',     type: 'notch',    frequency: 1000, Q: 10, enabled: false, description: 'Removes a narrow band of frequencies' },
  { id: 'peaking',  label: 'Peaking EQ', type: 'peaking', frequency: 1000, Q: 1,  gain: 6, enabled: false, description: 'Boosts or cuts a frequency band' },
]

export function useAudioPlayer() {
  const [audioBuffer, setAudioBuffer] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [pitchSemitones, setPitchSemitones] = useState(0)
  const [volume, setVolume] = useState(1)
  const [loadError, setLoadError] = useState(null)

  const audioCtxRef = useRef(null)
  const sourceRef = useRef(null)
  const gainNodeRef = useRef(null)
  const pauseOffsetRef = useRef(0)
  const startTimeRef = useRef(0)
  const rafRef = useRef(null)

  const getCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const loadFile = useCallback(async (file) => {
    setLoadError(null)
    try {
      const ctx = getCtx()
      const arrayBuffer = await file.arrayBuffer()
      const decoded = await ctx.decodeAudioData(arrayBuffer)
      setAudioBuffer(decoded)
      setDuration(decoded.duration)
      setCurrentTime(0)
      pauseOffsetRef.current = 0
      setIsPlaying(false)
    } catch (err) {
      setLoadError('Could not decode audio: ' + err.message)
    }
  }, [getCtx])

  const stopSource = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (sourceRef.current) {
      try { sourceRef.current.stop() } catch {}
      try { sourceRef.current.disconnect() } catch {}
      sourceRef.current = null
    }
  }, [])

  const startPlayback = useCallback((offset = 0) => {
    if (!audioBuffer) return
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()

    stopSource()

    // Build source
    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.detune.value = pitchSemitones * 100

    // Build filter chain
    const activeFilters = filters.filter(f => f.enabled)
    const gainNode = ctx.createGain()
    gainNode.gain.value = volume
    gainNodeRef.current = gainNode

    let lastNode = source
    for (const f of activeFilters) {
      const node = ctx.createBiquadFilter()
      node.type = f.type
      node.frequency.value = f.frequency
      node.Q.value = f.Q
      if (f.gain !== undefined) node.gain.value = f.gain
      lastNode.connect(node)
      lastNode = node
    }
    lastNode.connect(gainNode)
    gainNode.connect(ctx.destination)

    sourceRef.current = source
    startTimeRef.current = ctx.currentTime - offset
    source.start(0, offset)
    setIsPlaying(true)

    source.onended = () => {
      if (sourceRef.current === source) {
        setIsPlaying(false)
        setCurrentTime(0)
        pauseOffsetRef.current = 0
        sourceRef.current = null
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
      }
    }

    const tick = () => {
      if (sourceRef.current === source && audioCtxRef.current) {
        const elapsed = audioCtxRef.current.currentTime - startTimeRef.current
        setCurrentTime(Math.min(Math.max(elapsed, 0), audioBuffer.duration))
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [audioBuffer, pitchSemitones, filters, volume, getCtx, stopSource])

  const play = useCallback(() => {
    startPlayback(pauseOffsetRef.current)
  }, [startPlayback])

  const pause = useCallback(() => {
    if (!isPlaying) return
    const ctx = audioCtxRef.current
    if (ctx) pauseOffsetRef.current = Math.max(0, ctx.currentTime - startTimeRef.current)
    stopSource()
    setIsPlaying(false)
  }, [isPlaying, stopSource])

  const stop = useCallback(() => {
    stopSource()
    pauseOffsetRef.current = 0
    setCurrentTime(0)
    setIsPlaying(false)
  }, [stopSource])

  const seek = useCallback((time) => {
    const clamped = Math.max(0, Math.min(time, duration))
    pauseOffsetRef.current = clamped
    setCurrentTime(clamped)
    if (isPlaying) startPlayback(clamped)
  }, [isPlaying, duration, startPlayback])

  // Volume change: update live gain node if playing
  const changeVolume = useCallback((val) => {
    setVolume(val)
    if (gainNodeRef.current) gainNodeRef.current.gain.value = val
  }, [])

  const toggleFilter = useCallback((id) => {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, enabled: !f.enabled } : f))
  }, [])

  const updateFilter = useCallback((id, updates) => {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setPitchSemitones(0)
  }, [])

  useEffect(() => {
    return () => {
      stopSource()
      if (audioCtxRef.current) audioCtxRef.current.close()
    }
  }, [stopSource])

  return {
    audioBuffer,
    isPlaying,
    currentTime,
    duration,
    filters,
    pitchSemitones,
    volume,
    loadError,
    loadFile,
    play,
    pause,
    stop,
    seek,
    changeVolume,
    toggleFilter,
    updateFilter,
    setPitchSemitones,
    resetFilters,
  }
}
