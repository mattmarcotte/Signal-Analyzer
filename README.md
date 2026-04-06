# Signal Analyzer

A full-stack application for analyzing audio/signal files. Upload a `.wav` or `.csv` file and get:

- **FFT** — frequency spectrum with peak frequency detection
- **Spectrogram** — time-frequency heatmap rendered as a PNG image
- **SNR** — signal-to-noise ratio analysis with power measurements

## Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Backend  | Python 3.12, FastAPI, NumPy, SciPy, Matplotlib |
| Frontend | React 18, Vite, Tailwind CSS, Recharts, Radix UI |
| Infra    | Docker, Docker Compose, Nginx                 |

---

## Development Workflow (two terminals)

### Terminal 1 — Backend

```bash
cd backend

# Create and activate a virtual environment (first time only)
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Start the API server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at <http://localhost:8000>.
Interactive docs at <http://localhost:8000/docs>.

### Terminal 2 — Frontend

```bash
cd frontend

# Install Node dependencies (first time only)
npm install

# Start the Vite dev server
npm run dev
```

The UI will be available at <http://localhost:5173>.

The Vite dev server proxies `/analyze/*` requests to `http://localhost:8000`, so no CORS configuration is needed during development.

---

## Docker Workflow

Build and start both services with Docker Compose:

```bash
docker compose up --build
```

| Service  | URL                    |
|----------|------------------------|
| Frontend | <http://localhost:3000> |
| Backend  | <http://localhost:8000> |

To stop:

```bash
docker compose down
```

To rebuild after code changes:

```bash
docker compose up --build --force-recreate
```

---

## Generating Test Signals

Use the included script to create synthetic `.wav` and `.csv` test files:

```bash
# Generate test_signal.wav and test_signal.csv in the project root
python generate_test_signal.py

# Generate signals AND smoke-test all three API endpoints
python generate_test_signal.py --test-api

# Point to a custom backend URL
python generate_test_signal.py --test-api --url http://localhost:8000
```

The generated signal is a 2-second 44.1 kHz mix of 440 Hz (A4) and 880 Hz (A5) sine waves with small Gaussian noise.

---

## API Endpoints

| Method | Path                  | Description                                     |
|--------|-----------------------|-------------------------------------------------|
| GET    | `/health`             | Liveness check — returns `{"status":"ok",...}`  |
| POST   | `/analyze/fft`        | Compute FFT; returns frequencies and magnitudes |
| POST   | `/analyze/spectrogram`| Render spectrogram; returns base64 PNG          |
| POST   | `/analyze/snr`        | Estimate SNR; returns power metrics             |

All `POST` endpoints accept `multipart/form-data` with a single `file` field (`.wav` or `.csv`, max 20 MB).

### Example with curl

```bash
curl -X POST http://localhost:8000/analyze/fft \
  -F "file=@test_signal.wav" | python -m json.tool
```

---

## Environment Variables

### Backend

| Variable          | Default | Description                                             |
|-------------------|---------|---------------------------------------------------------|
| `ALLOWED_ORIGINS` | `*`     | Comma-separated list of allowed CORS origins            |

### Frontend (Vite build-time)

| Variable        | Default                  | Description                     |
|-----------------|--------------------------|---------------------------------|
| `VITE_API_URL`  | `""` (same origin)       | Base URL of the backend API     |

Set `VITE_API_URL` when the frontend and backend are on different origins (e.g. Docker or production deployments).

---

## Project Structure

```
signal-analyzer/
├── backend/
│   ├── main.py           # FastAPI app, routes, middleware
│   ├── analysis.py       # FFT, spectrogram, SNR logic
│   ├── models.py         # Pydantic response models
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Main React component
│   │   ├── main.jsx      # React root entry point
│   │   └── index.css     # Tailwind + ShadCN CSS variables
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   ├── nginx.conf        # Nginx config for production container
│   └── Dockerfile
├── docker-compose.yml
├── generate_test_signal.py
└── README.md
```
