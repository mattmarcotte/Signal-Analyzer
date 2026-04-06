import os

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from analysis import compute_fft, compute_snr, compute_spectrogram, load_signal
from models import FFTResult, HealthResponse, SNRResult, SpectrogramResult

load_dotenv()

# Parse allowed origins from environment variable
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
if _raw_origins.strip():
    ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]
else:
    ALLOWED_ORIGINS = ["*"]

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_EXTENSIONS = {"wav", "csv", "mp3"}

app = FastAPI(title="Signal Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _validate_upload(file: UploadFile) -> None:
    """Raise HTTPException for invalid extension."""
    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{ext}'. Only .wav, .mp3, and .csv are supported.",
        )


async def _read_file(file: UploadFile) -> bytes:
    """Read and size-validate uploaded file bytes."""
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(data)} bytes). Maximum allowed size is 20 MB.",
        )
    return data


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", version="1.0.0")


@app.post("/analyze/fft", response_model=FFTResult)
async def analyze_fft(file: UploadFile = File(...)) -> FFTResult:
    _validate_upload(file)
    data = await _read_file(file)
    try:
        samples, sample_rate = load_signal(data, file.filename or "upload.wav")
        return compute_fft(samples, sample_rate)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/analyze/spectrogram", response_model=SpectrogramResult)
async def analyze_spectrogram(file: UploadFile = File(...)) -> SpectrogramResult:
    _validate_upload(file)
    data = await _read_file(file)
    try:
        samples, sample_rate = load_signal(data, file.filename or "upload.wav")
        return compute_spectrogram(samples, sample_rate)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/analyze/snr", response_model=SNRResult)
async def analyze_snr(file: UploadFile = File(...)) -> SNRResult:
    _validate_upload(file)
    data = await _read_file(file)
    try:
        samples, sample_rate = load_signal(data, file.filename or "upload.wav")
        return compute_snr(samples, sample_rate)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
