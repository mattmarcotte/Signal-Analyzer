import React from 'react'
import { Play, Pause, Square, Volume2 } from 'lucide-react'

function formatTime(seconds) {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function AudioPlayer({ isPlaying, currentTime, duration, volume, onPlay, onPause, onStop, onSeek, onVolumeChange }) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleSeekClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    onSeek(ratio * duration)
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Playback</span>
        <span className="text-xs text-muted-foreground font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 bg-muted rounded-full cursor-pointer overflow-hidden"
        onClick={handleSeekClick}
      >
        <div
          className="h-full bg-primary rounded-full transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {isPlaying ? (
          <button
            onClick={onPause}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Pause className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={onPlay}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Play className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onStop}
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
        >
          <Square className="h-4 w-4" />
        </button>

        {/* Volume */}
        <div className="flex items-center gap-2 ml-auto">
          <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-20 accent-primary"
          />
        </div>
      </div>
    </div>
  )
}
