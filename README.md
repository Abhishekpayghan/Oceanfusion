# OceanFusion 3D Dashboard & Model-Observation Explorer

Fullstack web platform for 4D ocean numerical model visualization (INCOIS-GODAS / HYCOM), Argo float observation comparison, AI anomaly detection, and sub-millisecond daywise timeline playback.

---

## Project Architecture

```text
3DOcean_fusion/
├── oceanfusion_fullstack/
│   ├── oceanfusion_backend/      # FastAPI Python server
│   │   ├── app/
│   │   │   ├── api/              # API endpoints (/api/model, /api/argo, /api/compare, etc.)
│   │   │   ├── services/         # NetCDF reader, interpolation, observation adapter
│   │   │   └── ml/               # Anomaly detection & ML pipeline
│   │   └── README.md
│   └── oceanfusion_frontend/     # React + Vite 3D dashboard
│       └── src/
│           ├── components/       # OceanScene 3D view, ProfileChart, ObservationPanel, SliderBar
│           └── pages/            # Dashboard, RegionSelect
└── README.md
```

---

## Setup & Running Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/Abhishekpayghan/Oceanfusion.git
cd Oceanfusion
```

### 2. Start the Backend (FastAPI)
```bash
cd oceanfusion_fullstack/oceanfusion_backend

# Create virtual environment (optional but recommended)
python -m venv .venv
# On Windows: .venv\Scripts\activate
# On Linux/macOS: source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables (copy template)
cp .env.example .env

# Start FastAPI server on port 8000
python -m uvicorn app.main:app --port 8000 --reload
```
> Backend runs at: `http://127.0.0.1:8000`

### 3. Start the Frontend (React + Vite)
In a new terminal window:
```bash
cd oceanfusion_fullstack/oceanfusion_frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```
> Frontend runs at: `http://localhost:5173`

---

## Key Features
- **4D Ocean Explorer**: 3D spatial slices for temperature & salinity across depth layers (0m - 1000m).
- **Sub-Millisecond Timeline Playback**: Frame-synchronized daywise playback loop (< 1ms backend latency).
- **Argo Float Comparison**: Real-time profile graphs (Plotly) and point comparison metrics (`Model Value`, `Observed Value`, `Signed Error`).
- **AI Anomaly Radar**: Automated mismatch detection and anomaly highlighting.
- **Request Cancellation**: Built-in `AbortController` cancellation for responsive UI interaction.
