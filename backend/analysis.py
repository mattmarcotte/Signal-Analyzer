import io
import base64
from typing import Tuple

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.io import wavfile
from scipy.signal import spectrogram
from pydub import AudioSegment

from models import FFTResult, SpectrogramResult, SNRResult


def load_signal(file_bytes: bytes, filename: str) -> Tuple[np.ndarray, int]:
    """Load a signal from WAV, MP3, or CSV bytes and return (samples, sample_rate)."""
    ext = filename.lower().rsplit(".", 1)[-1]

    if ext in ("wav", "mp3"):
        if ext == "mp3":
            audio = AudioSegment.from_mp3(io.BytesIO(file_bytes))
            audio = audio.set_channels(1)
            sample_rate = audio.frame_rate
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            samples /= float(2 ** (audio.sample_width * 8 - 1))
        else:
            sample_rate, data = wavfile.read(io.BytesIO(file_bytes))
            # Convert stereo to mono by averaging channels
            if data.ndim == 2:
                data = data.mean(axis=1)
            # Normalize integer types to float32 in [-1, 1]
            if np.issubdtype(data.dtype, np.integer):
                max_val = np.iinfo(data.dtype).max
                samples = data.astype(np.float32) / max_val
            else:
                samples = data.astype(np.float32)

        return samples, int(sample_rate)

    elif ext == "csv":
        text = file_bytes.decode("utf-8", errors="replace")
        raw = np.loadtxt(io.StringIO(text), delimiter=",", usecols=0)
        raw = raw.astype(np.float32)

        # Normalize to [-1, 1]
        max_abs = np.abs(raw).max()
        if max_abs > 0:
            samples = raw / max_abs
        else:
            samples = raw

        return samples, 44100

    else:
        raise ValueError(f"Unsupported file extension: {ext}")


def compute_fft(samples: np.ndarray, sample_rate: int) -> FFTResult:
    """Compute the FFT of a signal and return frequency/magnitude arrays."""
    n = len(samples)

    # Apply Hann window
    window = np.hanning(n)
    windowed = samples * window

    # Compute real FFT
    fft_vals = np.fft.rfft(windowed)
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)

    # Magnitude spectrum normalized by N
    magnitudes = np.abs(fft_vals) / n

    # Downsample to max 2048 points if longer
    if len(freqs) > 2048:
        step = len(freqs) // 2048
        freqs = freqs[::step]
        magnitudes = magnitudes[::step]

    peak_idx = int(np.argmax(magnitudes))
    peak_frequency = float(freqs[peak_idx])

    return FFTResult(
        frequencies=freqs.tolist(),
        magnitudes=magnitudes.tolist(),
        peak_frequency=peak_frequency,
        sample_rate=sample_rate,
    )


def compute_spectrogram(samples: np.ndarray, sample_rate: int) -> SpectrogramResult:
    """Compute and render a labeled spectrogram image, returned as base64-encoded PNG."""
    freqs, times, Sxx = spectrogram(samples, fs=sample_rate, nperseg=256)

    # Convert power to dB
    Sxx_db = 10 * np.log10(Sxx + 1e-10)

    fig, ax = plt.subplots(figsize=(10, 4))
    fig.patch.set_facecolor('#0f0f0f')
    ax.set_facecolor('#0f0f0f')

    mesh = ax.pcolormesh(times, freqs, Sxx_db, shading="gouraud", cmap="inferno")

    ax.set_xlabel("Time (s)", color="#aaaaaa", fontsize=11)
    ax.set_ylabel("Frequency (Hz)", color="#aaaaaa", fontsize=11)
    ax.tick_params(colors="#aaaaaa", labelsize=9)
    for spine in ax.spines.values():
        spine.set_edgecolor("#333333")

    cbar = fig.colorbar(mesh, ax=ax, pad=0.02)
    cbar.set_label("Power (dB)", color="#aaaaaa", fontsize=10)
    cbar.ax.yaxis.set_tick_params(color="#aaaaaa", labelsize=8)
    plt.setp(cbar.ax.yaxis.get_ticklabels(), color="#aaaaaa")

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)

    image_base64 = base64.b64encode(buf.read()).decode("utf-8")
    duration_seconds = float(len(samples) / sample_rate)

    return SpectrogramResult(
        image_base64=image_base64,
        time_bins=int(times.shape[0]),
        freq_bins=int(freqs.shape[0]),
        duration_seconds=duration_seconds,
    )


def compute_snr(samples: np.ndarray, sample_rate: int) -> SNRResult:
    """Estimate SNR by separating signal band from noise in the power spectrum."""
    freqs, times, Sxx = spectrogram(samples, fs=sample_rate, nperseg=256)

    # Average power per frequency bin across time
    avg_power = Sxx.mean(axis=1)

    # Find the peak frequency bin
    peak_bin = int(np.argmax(avg_power))
    peak_freq = float(freqs[peak_bin])

    # Define signal band as ±5% of peak frequency, minimum 100 Hz wide
    half_band = max(peak_freq * 0.05, 50.0)
    f_low = peak_freq - half_band
    f_high = peak_freq + half_band

    signal_mask = (freqs >= f_low) & (freqs <= f_high)
    noise_mask = ~signal_mask

    signal_power = float(avg_power[signal_mask].sum()) if signal_mask.any() else 1e-20
    noise_power = float(avg_power[noise_mask].sum()) if noise_mask.any() else 1e-20

    signal_power = max(signal_power, 1e-20)
    noise_power = max(noise_power, 1e-20)

    signal_power_db = 10 * np.log10(signal_power)
    noise_power_db = 10 * np.log10(noise_power)
    snr_db = signal_power_db - noise_power_db
    bandwidth_hz = float(f_high - f_low)

    return SNRResult(
        snr_db=float(snr_db),
        signal_power_db=float(signal_power_db),
        noise_power_db=float(noise_power_db),
        peak_frequency=peak_freq,
        bandwidth_hz=bandwidth_hz,
    )
