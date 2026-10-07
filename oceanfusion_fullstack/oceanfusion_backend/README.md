# OceanFusion Backend — Prototype

SIH 2026 · Problem Statement 26067 · INCOIS

FastAPI backend implementing the endpoint table from the implementation
guide (section 7.3), the model↔observation matching engine (section 8), and
the ObservationAdapter pattern (section 7.2) that lets new sensors plug in
without a rewrite.

## Why it works without INCOIS access yet

INCOIS-GODAS and the ERDDAP Argo feed both require access to be requested
(guide section 4 / section 20 risk table). So that the team isn't blocked:

- `app/services/synthetic_data.py` generates a full 4D (day, depth, lat, lon)
  xarray Dataset from an analytic, ocean-like function, and a synthetic Argo
  fleet with realistic float-to-float bias and noise.
- Every other file — the interpolation/matching engine, the API routes, the
  Pydantic schemas — is written exactly as it would be against real data.
- Switching to real data later is a **config change, not a rewrite**:
  set `OCEANFUSION_MODEL_SOURCE=godas` (or `copernicus`) and
  `OCEANFUSION_MODEL_PATH=/path/to/file.nc`, and/or
  `OCEANFUSION_ARGO_SOURCE=erddap`. See `app/config.py`.
- `app/services/observation_adapter.py` already contains a complete,
  ready-to-run `ERDDAPArgoAdapter` built from the guide's exact query URL
  (section 5.1) — it just isn't the default because this sandbox can't reach
  `erddap.incois.gov.in`.

## Run it

```bash
cd oceanfusion_backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open **http://127.0.0.1:8000/docs** for interactive Swagger docs covering
every endpoint, or hit them directly:

```bash
curl "http://127.0.0.1:8000/api/model/slice?variable=temp&depth=100&day=1"
curl "http://127.0.0.1:8000/api/argo"
curl "http://127.0.0.1:8000/api/argo/<float_id>?variable=temp&day=1"
curl "http://127.0.0.1:8000/api/compare/<float_id>?variable=temp&depth=100&day=1"
curl "http://127.0.0.1:8000/api/analytics/fleet?variable=temp&depth=100&day=1"
curl "http://127.0.0.1:8000/api/anomaly?variable=temp&depth=100&day=1"
curl "http://127.0.0.1:8000/api/metadata"
```

All endpoints were smoke-tested end-to-end while building this (real HTTP
calls against a running server, not just import checks) — model slice
values, per-depth profile comparison, fleet MAE/RMSE/bias, and anomaly
z-score flagging all return correct, internally consistent numbers.

## Endpoint map (matches guide section 7.3)

| Endpoint | Returns |
|---|---|
| `GET /api/model/slice` | A depth/time slice of the model grid |
| `GET /api/model/volume` | All standard depth levels for one day (3D block) |
| `GET /api/model/currents` | U/V current vectors on a coarse grid |
| `GET /api/argo` | Observation points in the region |
| `GET /api/argo/{id}` | One float's full profile + the model's matching profile |
| `GET /api/compare/{id}` | Model vs observation + signed error at one depth/day |
| `GET /api/analytics/fleet` | Bias / MAE / RMSE across all floats |
| `GET /api/anomaly` | Z-score anomaly flags ("worth checking", never asserted as fact) |
| `GET /api/glider/tracks` | Stub proving the adapter slot exists (no real feed yet) |
| `GET /api/metadata` | Units, region, data source, provenance note |

## Connecting the 3D frontend to this backend

The standalone `oceanfusion_prototype.html` file computes everything
client-side so it can be demoed with zero setup. To wire it to this real
backend instead, replace its `fieldValue()` / `obsValue()` calls with
`fetch('http://127.0.0.1:8000/api/model/slice?...')` /
`fetch('http://127.0.0.1:8000/api/compare/...')` — the response shapes were
designed to map directly onto what the Three.js slice texture and Plotly
profile chart already expect.

## What's deliberately left as a documented next step

- Real NetCDF ingestion is wired (`netcdf_reader.get_dataset` real-file
  branch) but untested here — needs an actual `.nc` file to point at.
- `ERDDAPArgoAdapter` is complete but untested here — this sandbox's network
  egress doesn't include `erddap.incois.gov.in`. Test it from a machine that
  can reach that host.
- PostgreSQL/PostGIS metadata store, Redis caching, and Docker packaging
  (guide sections 13–14) are not yet implemented — the current prototype
  keeps everything in memory, which is fine for a demo but not for
  production load.
