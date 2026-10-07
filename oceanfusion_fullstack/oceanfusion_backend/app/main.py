"""
OceanFusion backend -- FastAPI entrypoint.

Run with:
    uvicorn app.main:app --reload --port 8000

Then open http://127.0.0.1:8000/docs for interactive Swagger docs covering
every endpoint from the implementation guide's section 7.3 table.
"""
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import anomaly, argo, comparison, copernicus, glider, model, observation

app = FastAPI(
    title="OceanFusion API",
    description="SIH 2026 · PS 26067 · INCOIS — 4D ocean model/observation comparison backend",
    version="0.1.0-prototype",
)

# Frontend (React + Vite dev server, or the standalone 3D prototype) calls
# this API from a different origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to the real frontend origin before deployment
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Section 14 security checklist: 'Log every query and how long it took
    to process.'"""
    start = time.time()
    response = await call_next(request)
    elapsed_ms = (time.time() - start) * 1000
    print(f"{request.method} {request.url.path}?{request.url.query}  "
          f"-> {response.status_code}  ({elapsed_ms:.1f} ms)")
    return response


app.include_router(model.router)
app.include_router(argo.router)
app.include_router(glider.router)
app.include_router(observation.router)
app.include_router(comparison.router)
app.include_router(anomaly.router)
app.include_router(copernicus.router)


@app.get("/")
def root():
    return {
        "service": "OceanFusion API",
        "docs": "/docs",
        "endpoints": [
            "/api/regions",
            "/api/model/slice", "/api/model/volume", "/api/model/currents",
            "/api/argo", "/api/argo/{id}",
            "/api/compare/{id}", "/api/analytics/fleet", "/api/anomaly",
            "/api/glider/tracks", "/api/metadata",
        ],
    }
