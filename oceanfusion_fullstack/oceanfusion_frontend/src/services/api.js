/**
 * Thin fetch wrapper around the OceanFusion FastAPI backend
 * (see oceanfusion_backend/app/api/*.py for the actual routes).
 *
 * Base URL is a setting, not hard-coded, per the guide's "source file
 * location is a setting" principle -- point VITE_API_BASE_URL at wherever
 * the backend is actually running.
 *
 * Every data-fetching call takes a `region` (the key the user picked on the
 * region-select screen, e.g. "bay_of_bengal") so the 3D scene, Argo floats,
 * and stats all reflect whichever ocean region is currently selected.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
export const DEFAULT_REGION = 'bay_of_bengal';

async function getJSON(path, signal) {
  const res = await fetch(`${BASE_URL}${path}`, { signal });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`API ${path} failed: ${res.status} ${detail}`);
  }
  return res.json();
}

export function fetchRegions(signal) {
  return getJSON('/api/regions', signal);
}

export function fetchSlice({ variable, depth, day, region = DEFAULT_REGION, signal }) {
  return getJSON(`/api/model/slice?variable=${variable}&depth=${depth}&day=${day}&region=${region}`, signal);
}

export function fetchCurrents({ day, region = DEFAULT_REGION, signal }) {
  return getJSON(`/api/model/currents?day=${day}&region=${region}`, signal);
}

export function fetchFloats({ region = DEFAULT_REGION, signal } = {}) {
  return getJSON(`/api/argo?region=${region}`, signal);
}

export function fetchObservations({ region = DEFAULT_REGION, type = '', signal } = {}) {
  const query = type ? `&obs_type=${type}` : '';
  return getJSON(`/api/observations?region=${region}${query}`, signal);
}

export function fetchObservationLayers(signal) {
  return getJSON('/api/observations/layers', signal);
}

export function fetchFloatProfile({ floatId, variable, day, region = DEFAULT_REGION, signal }) {
  return getJSON(`/api/argo/${floatId}?variable=${variable}&day=${day}&region=${region}`, signal);
}

export function fetchCompare({ floatId, variable, depth, day, region = DEFAULT_REGION, signal }) {
  return getJSON(`/api/compare/${floatId}?variable=${variable}&depth=${depth}&day=${day}&region=${region}`, signal);
}

export function fetchFleetStats({ variable, depth, day, region = DEFAULT_REGION, signal }) {
  return getJSON(`/api/analytics/fleet?variable=${variable}&depth=${depth}&day=${day}&region=${region}`, signal);
}

export function fetchAnomalies({ variable, depth, day, region = DEFAULT_REGION, signal }) {
  return getJSON(`/api/anomaly?variable=${variable}&depth=${depth}&day=${day}&region=${region}`, signal);
}

export function fetchAnomalyDetect({ region = DEFAULT_REGION, depth = 0, day = 1, injectSyntheticAnomaly = false, signal } = {}) {
  const url = `/api/anomaly/detect?region=${region}&depth=${depth}&day=${day}&inject_synthetic_anomaly=${injectSyntheticAnomaly}`;
  return fetch(`${BASE_URL}${url}`, { method: 'POST', signal }).then(res => {
    if (!res.ok) throw new Error(`Anomaly detection failed: ${res.status}`);
    return res.json();
  });
}

export function fetchAnomalyStatus() {
  return getJSON('/api/anomaly/status');
}

export function trainAnomalyModel() {
  return fetch(`${BASE_URL}/api/anomaly/train`, { method: 'POST' }).then(res => {
    if (!res.ok) throw new Error(`Model training failed: ${res.status}`);
    return res.json();
  });
}

export function fetchMetadata({ region = DEFAULT_REGION } = {}) {
  return getJSON(`/api/metadata?region=${region}`);
}

export async function uploadCSV(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/api/argo/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`CSV Upload failed: ${res.status} ${detail}`);
  }
  return res.json();
}

export function fetchGliders({ refresh = false, signal } = {}) {
  const query = refresh ? '?refresh=true' : '';
  return getJSON(`/api/gliders${query}`, signal);
}

export function fetchGliderPlatforms(signal) {
  return getJSON('/api/gliders/platforms', signal);
}

export function fetchGliderTrack(platformId, signal) {
  return getJSON(`/api/gliders/${platformId}/track`, signal);
}

export function fetchGliderProfile(platformId, signal) {
  return getJSON(`/api/gliders/${platformId}/profile`, signal);
}

export function fetchCopernicusStatus(signal) {
  return getJSON('/api/copernicus/status', signal);
}

export { BASE_URL };
