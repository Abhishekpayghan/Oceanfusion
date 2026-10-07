import { useEffect, useState } from 'react';
import * as api from '../services/api';
import CustomRegionPicker from '../components/CustomRegionPicker';

const FALLBACK_REGIONS = [
  { key: 'arabian_sea', label: 'Arabian Sea', lat_min: 10, lat_max: 24, lon_min: 54, lon_max: 76 },
  { key: 'bay_of_bengal', label: 'Bay of Bengal', lat_min: 8, lat_max: 22, lon_min: 80, lon_max: 98 },
  { key: 'equatorial_io', label: 'Equatorial Indian Ocean', lat_min: -10, lat_max: 10, lon_min: 50, lon_max: 100 },
  { key: 'south_io', label: 'Southern Indian Ocean', lat_min: -30, lat_max: -10, lon_min: 60, lon_max: 110 },
];

/**
 * First screen the user sees. They pick which ocean region to explore;
 * the 3D dashboard that follows fetches the model field, currents, and
 * Argo floats scoped to whichever region key is chosen here.
 */
export default function RegionSelect({ onSelectRegion }) {
  const [regions, setRegions] = useState(null);
  const [error, setError] = useState(false);
  const [selecting, setSelecting] = useState(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  useEffect(() => {
    api.fetchRegions()
      .then(r => setRegions(r.regions))
      .catch(() => setError(true));
  }, []);

  const handlePick = (key) => {
    setSelecting(key);
    onSelectRegion(key);
  };

  const handleApplyCustom = (customKey) => {
    setShowCustomPicker(false);
    handlePick(customKey);
  };

  return (
    <div style={styles.page}>
      <div style={styles.centerCol}>
        <div style={styles.wordmark}>Ocean<span style={{ color: 'var(--current)' }}>Fusion</span></div>
        <div style={styles.tag}>SIH 2026 · PS 26067 · INCOIS — 4D model↔observation explorer</div>
        <h1 style={styles.heading}>Choose a region to explore</h1>
        <p style={styles.sub}>
          Pick an ocean region below or draw a custom bounding box. The 3D view, Argo floats,
          and every chart on the next screen will be scoped to whichever region you select here.
        </p>

        {error && (
          <div style={styles.errorBox}>
            Couldn't reach the backend server (FastAPI at port 8000). Showing offline fallback regions.
          </div>
        )}

        {!regions && !error && <div style={styles.loading}>Loading regions…</div>}

        <div style={styles.grid}>
          {(regions || FALLBACK_REGIONS).map(r => (
            <button
              key={r.key}
              style={styles.card}
              disabled={selecting !== null}
              onClick={() => handlePick(r.key)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--current)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--line)')}
            >
              <div style={styles.cardTitle}>{r.label}</div>
              <div style={styles.cardCoords}>
                {fmtLat(r.lat_min)} – {fmtLat(r.lat_max)},&nbsp;
                {fmtLon(r.lon_min)} – {fmtLon(r.lon_max)}
              </div>
              <div style={styles.cardCta}>
                {selecting === r.key ? 'Loading 3D view…' : 'Open 3D view →'}
              </div>
            </button>
          ))}

          {/* Custom Region Card */}
          <button
            style={{ ...styles.card, ...styles.customCard }}
            disabled={selecting !== null}
            onClick={() => setShowCustomPicker(true)}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--current)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--current)')}
          >
            <div style={styles.customCardTitle}>+ Custom Region</div>
            <div style={styles.cardCoords}>
              Draw any bounding box between 30°S–30°N and 30°E–120°E
            </div>
            <div style={styles.customCardCta}>
              Draw area on map →
            </div>
          </button>
        </div>

        {showCustomPicker && (
          <CustomRegionPicker
            onApply={handleApplyCustom}
            onCancel={() => setShowCustomPicker(false)}
          />
        )}
      </div>
    </div>
  );
}

function fmtLat(v) { return `${Math.abs(v).toFixed(0)}°${v >= 0 ? 'N' : 'S'}`; }
function fmtLon(v) { return `${Math.abs(v).toFixed(0)}°${v >= 0 ? 'E' : 'W'}`; }

const styles = {
  page: {
    height: '100vh', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(ellipse at 50% 20%, #0f3a52 0%, #041824 55%, #010a10 100%)',
    color: 'var(--foam)', fontFamily: 'var(--font)', padding: 24,
  },
  centerCol: { maxWidth: 760, width: '100%', textAlign: 'center' },
  wordmark: { fontSize: 30, fontWeight: 700, marginBottom: 6 },
  tag: { fontSize: 12.5, color: 'var(--mist)', marginBottom: 34 },
  heading: { fontSize: 22, margin: '0 0 10px', fontWeight: 600 },
  sub: { fontSize: 13.5, color: 'var(--mist)', maxWidth: 560, margin: '0 auto 30px', lineHeight: 1.6 },
  loading: { color: 'var(--mist)', fontSize: 13 },
  errorBox: {
    background: 'rgba(255,93,108,0.1)', border: '1px solid var(--error)', color: '#ffd7db',
    borderRadius: 8, padding: '14px 16px', fontSize: 12.5, textAlign: 'left', margin: '0 auto 20px', maxWidth: 560,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16,
  },
  card: {
    background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10,
    padding: '20px 18px', textAlign: 'left', cursor: 'pointer', color: 'var(--foam)',
    transition: 'border-color .15s, transform .1s', font: 'inherit',
  },
  cardTitle: { fontSize: 16, fontWeight: 600, marginBottom: 6 },
  cardCoords: { fontSize: 12, color: 'var(--mist)', fontFamily: 'var(--mono)', marginBottom: 14 },
  cardCta: { fontSize: 12.5, color: 'var(--current)', fontWeight: 600 },
  customCard: {
    background: 'rgba(32, 211, 194, 0.06)',
    border: '1px dashed var(--current)',
  },
  customCardTitle: { fontSize: 16, fontWeight: 700, color: 'var(--current)', marginBottom: 6 },
  customCardCta: { fontSize: 12.5, color: 'var(--current)', fontWeight: 700 },
};
