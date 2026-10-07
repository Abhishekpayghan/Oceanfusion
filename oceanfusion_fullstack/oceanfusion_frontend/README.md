# OceanFusion Frontend — React + Vite + Three.js

SIH 2026 · Problem Statement 26067 · INCOIS

A real React app (not the earlier single-file HTML prototype) built with
`npm create vite@latest`, matching the tech stack and folder layout from the
implementation guide (section 6 tech table, section 7.1 folder layout).

## Folder layout (maps to guide section 7.1)

```
src/
  components/
    OceanScene.jsx        3D view: water volume, waves, seafloor, data slice,
                           Argo markers, currents, camera controls, raycasting
    Header.jsx             top bar (variable / depth / day / region / API status)
    ControlsPanel.jsx      left rail: layer toggles, variable, opacity, jump-to-float
    SliderBar.jsx           bottom depth & time sliders with play/pause
    Legend.jsx              colour scale overlay
    ProfileChart.jsx        Plotly depth-profile chart (model vs observed)
    ObservationPanel.jsx    right rail: selected float, compare, fleet stats
  pages/
    Dashboard.jsx           composes everything, holds state, fetches from the API
  services/
    api.js                  fetch wrapper for every FastAPI endpoint
  styles/
    theme.css               shared dark-ocean CSS variables
```

## This is wired to the real backend, not synthetic client-side math

Unlike the standalone HTML prototype, this app has **no analytic ocean
functions of its own** -- every number it shows (the scalar slice, Argo
floats, profiles, comparison stats) comes from a `fetch()` call to the
FastAPI backend in `oceanfusion_backend/`. Run that first.

## Run it

```bash
# 1. start the backend (separate terminal)
cd oceanfusion_backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2. start this frontend
cd oceanfusion_frontend
npm install
cp .env.example .env      # points VITE_API_BASE_URL at the backend
npm run dev
```

Open the printed `http://localhost:5173` URL.

## Verified before delivery

- `npm run build` -- clean production build, 0 errors (only an expected
  bundle-size advisory from bundling Three.js + Plotly, not a bug)
- `npm run lint` (oxlint) -- 0 errors, 1 harmless advisory
- `npm run dev` -- dev server boots and serves without runtime errors

## Known follow-ups (not yet done)

- Code-splitting to shrink the initial bundle (Three.js + Plotly are heavy;
  dynamic `import()` on the chart and 3D view would help, but isn't needed
  for a demo on a normal laptop).
- A dedicated "Anomaly" toggle isn't in the UI yet -- the backend endpoint
  (`/api/anomaly`) is ready whenever you want to wire it in.
- No static-hosting build step wired up yet (e.g. `npm run build` output
  served behind nginx, matching the guide's deployment diagram in
  section 14) -- straightforward to add when you're ready to host it.
