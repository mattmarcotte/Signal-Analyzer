#!/usr/bin/env python3
"""
Generate synthetic test signals for the Signal Analyzer API.

Produces a 2-second signal composed of 440 Hz + 880 Hz sine waves
with small Gaussian noise, saved as both test_signal.wav and test_signal.csv.

Usage:
    python generate_test_signal.py
    python generate_test_signal.py --test-api
    python generate_test_signal.py --test-api --url http://localhost:8000
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import scipy.io.wavfile as wav


# ── Signal generation ─────────────────────────────────────────────────────────

SAMPLE_RATE = 44100
DURATION = 2.0          # seconds
FREQ_A = 440.0           # Hz  (A4)
FREQ_B = 880.0           # Hz  (A5)
NOISE_STD = 0.02         # relative amplitude of Gaussian noise
OUTPUT_DIR = Path(__file__).parent


def generate_signal() -> np.ndarray:
    """Return float32 samples in [-1, 1]."""
    t = np.linspace(0, DURATION, int(SAMPLE_RATE * DURATION), endpoint=False)
    signal = (
        0.5 * np.sin(2 * np.pi * FREQ_A * t)
        + 0.3 * np.sin(2 * np.pi * FREQ_B * t)
    )
    rng = np.random.default_rng(seed=42)
    noise = rng.normal(0, NOISE_STD, size=signal.shape)
    combined = signal + noise
    # Normalise so peak is exactly 1.0
    combined /= np.abs(combined).max()
    return combined.astype(np.float32)


def save_wav(samples: np.ndarray, path: Path) -> None:
    int16_samples = (samples * 32767).astype(np.int16)
    wav.write(str(path), SAMPLE_RATE, int16_samples)
    print(f"  Saved WAV  -> {path}  ({path.stat().st_size / 1024:.1f} KB)")


def save_csv(samples: np.ndarray, path: Path) -> None:
    np.savetxt(str(path), samples, delimiter=",", fmt="%.8f")
    print(f"  Saved CSV  -> {path}  ({path.stat().st_size / 1024:.1f} KB)")


# ── API test ──────────────────────────────────────────────────────────────────

def test_api(base_url: str, wav_path: Path) -> None:
    try:
        import urllib.request
        import urllib.error
    except ImportError:
        print("ERROR: urllib not available (this should never happen).")
        sys.exit(1)

    # urllib.request supports multipart via http.client; use a simple boundary approach
    import http.client
    import uuid
    from urllib.parse import urlparse

    def post_file(endpoint: str) -> dict:
        boundary = uuid.uuid4().hex
        with open(wav_path, "rb") as f:
            file_bytes = f.read()

        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{wav_path.name}"\r\n'
            f"Content-Type: audio/wav\r\n\r\n"
        ).encode() + file_bytes + f"\r\n--{boundary}--\r\n".encode()

        parsed = urlparse(base_url)
        host = parsed.netloc
        use_ssl = parsed.scheme == "https"
        conn_cls = http.client.HTTPSConnection if use_ssl else http.client.HTTPConnection
        conn = conn_cls(host, timeout=30)
        conn.request(
            "POST",
            endpoint,
            body=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": str(len(body)),
            },
        )
        resp = conn.getresponse()
        raw = resp.read().decode("utf-8")
        conn.close()
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}: {raw[:200]}")
        return json.loads(raw)

    endpoints = [
        ("/analyze/fft",         "FFT"),
        ("/analyze/spectrogram", "Spectrogram"),
        ("/analyze/snr",         "SNR"),
    ]

    print(f"\nTesting API at {base_url} with {wav_path.name} ...")
    print("-" * 60)

    for path, label in endpoints:
        print(f"  POST {path} ...", end=" ", flush=True)
        try:
            result = post_file(path)
            print("OK")
            if label == "FFT":
                print(f"    Peak frequency : {result['peak_frequency']:.2f} Hz")
                print(f"    Sample rate    : {result['sample_rate']} Hz")
                print(f"    Points         : {len(result['frequencies'])}")
            elif label == "Spectrogram":
                img_kb = len(result["image_base64"]) * 3 / 4 / 1024
                print(f"    Image size     : ~{img_kb:.1f} KB (base64-decoded)")
                print(f"    Duration       : {result['duration_seconds']:.3f} s")
                print(f"    Time bins      : {result['time_bins']}")
                print(f"    Freq bins      : {result['freq_bins']}")
            elif label == "SNR":
                print(f"    SNR            : {result['snr_db']:.2f} dB")
                print(f"    Signal power   : {result['signal_power_db']:.2f} dB")
                print(f"    Noise power    : {result['noise_power_db']:.2f} dB")
                print(f"    Peak frequency : {result['peak_frequency']:.2f} Hz")
                print(f"    Bandwidth      : {result['bandwidth_hz']:.2f} Hz")
        except Exception as exc:
            print(f"FAILED\n    {exc}")

    print("-" * 60)


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Generate test signals for Signal Analyzer.")
    parser.add_argument(
        "--test-api",
        action="store_true",
        help="After generating signals, upload test_signal.wav to all three API endpoints.",
    )
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Base URL of the Signal Analyzer backend (default: http://localhost:8000).",
    )
    args = parser.parse_args()

    wav_path = OUTPUT_DIR / "test_signal.wav"
    csv_path = OUTPUT_DIR / "test_signal.csv"

    print("Generating synthetic signal ...")
    print(f"  Composition : 440 Hz (A4) + 880 Hz (A5) + Gaussian noise (σ={NOISE_STD})")
    print(f"  Duration    : {DURATION} s  |  Sample rate: {SAMPLE_RATE} Hz")

    samples = generate_signal()
    save_wav(samples, wav_path)
    save_csv(samples, csv_path)
    print("Done.")

    if args.test_api:
        test_api(args.url.rstrip("/"), wav_path)


if __name__ == "__main__":
    main()
