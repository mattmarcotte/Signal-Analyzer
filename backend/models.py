from pydantic import BaseModel


class FFTResult(BaseModel):
    frequencies: list[float]
    magnitudes: list[float]
    peak_frequency: float
    sample_rate: int


class SpectrogramResult(BaseModel):
    image_base64: str
    time_bins: int
    freq_bins: int
    duration_seconds: float


class SNRResult(BaseModel):
    snr_db: float
    signal_power_db: float
    noise_power_db: float
    peak_frequency: float
    bandwidth_hz: float


class HealthResponse(BaseModel):
    status: str
    version: str
