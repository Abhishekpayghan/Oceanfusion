export default function Header({
  variable, depth, day, nDays, apiOk, regionLabel, bounds, onChangeRegion,
  anomalyCount = 0, showAnomalyPanel, onToggleAnomalyPanel,
  viewMode = 'analysis', onSelectView,
}) {
  const regionCoords = bounds
    ? `${fmtLat(bounds.latMin)}–${fmtLat(bounds.latMax)} · ${fmtLon(bounds.lonMin)}–${fmtLon(bounds.lonMax)}`
    : '…';

  return (
    <header style={styles.header}>
      <div style={styles.brand}>
        <div style={styles.wordmark}>Ocean<span style={{ color: 'var(--current)' }}>Fusion</span></div>
        <div style={styles.tag}>SIH 2026 · PS 26067 · INCOIS</div>
      </div>

      {/* Navigation View Switcher */}
      <div style={styles.navTabs}>
        <button
          style={{
            ...styles.navBtn,
            ...(viewMode === 'region_select' ? styles.navBtnActive : {}),
          }}
          onClick={() => onSelectView?.('region_select')}
        >
          🗺️ Region
        </button>
        <button
          style={{
            ...styles.navBtn,
            ...(viewMode === 'globe' ? styles.navBtnActive : {}),
          }}
          onClick={() => onSelectView?.('globe')}
        >
          🌍 Observation Globe
        </button>
        <button
          style={{
            ...styles.navBtn,
            ...(viewMode === 'analysis' ? styles.navBtnActive : {}),
          }}
          onClick={() => onSelectView?.('analysis')}
        >
          🧊 Ocean Analysis
        </button>
      </div>

      <div style={styles.stats}>
        {viewMode === 'analysis' && (
          <>
            <div>Variable <b>{variable === 'temp' ? 'Temperature' : 'Salinity'}</b></div>
            <div>Depth <b>{depth} m</b></div>
            <div>Day <b>{day}</b> of {nDays}</div>
            <div>Region <b>{regionLabel || '…'}</b></div>
          </>
        )}
        <div style={{ color: apiOk ? 'var(--current)' : 'var(--error)' }}>
          ● {apiOk ? 'Backend Live' : 'Offline'}
        </div>

        {onToggleAnomalyPanel && viewMode === 'analysis' && (
          <button
            style={{
              ...styles.anomalyBtn,
              background: showAnomalyPanel ? 'rgba(255,66,82,0.25)' : 'rgba(255,66,82,0.12)',
              borderColor: anomalyCount > 0 ? '#ff4252' : 'var(--line)',
            }}
            onClick={onToggleAnomalyPanel}
          >
            <span style={styles.pulseDot} />
            🤖 AI Anomaly Radar
            {anomalyCount > 0 && <span style={styles.badge}>{anomalyCount}</span>}
          </button>
        )}
      </div>
    </header>
  );
}

function fmtLat(v) { return `${Math.abs(v).toFixed(0)}°${v >= 0 ? 'N' : 'S'}`; }
function fmtLon(v) { return `${Math.abs(v).toFixed(0)}°${v >= 0 ? 'E' : 'W'}`; }

const styles = {
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 20px', height: 56, borderBottom: '1px solid var(--line)',
    background: 'linear-gradient(180deg,var(--deep),var(--abyss))',
  },
  brand: { display: 'flex', alignItems: 'baseline', gap: 10 },
  wordmark: { fontSize: 19, fontWeight: 600, color: 'var(--foam)' },
  tag: { fontSize: 11.5, color: 'var(--mist)' },
  stats: { display: 'flex', alignItems: 'center', gap: 26, fontSize: 12.5, color: 'var(--mist)' },
  changeBtn: { width: 'auto', padding: '5px 10px', fontSize: 11.5 },
  anomalyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 12px',
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--foam)',
    border: '1px solid',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: '#ff4252',
    boxShadow: '0 0 6px #ff4252',
    display: 'inline-block',
  },
  badge: {
    background: '#ff4252',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 10,
    marginLeft: 2,
  },
  navTabs: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(6, 20, 31, 0.6)',
    padding: '4px 6px',
    borderRadius: 8,
    border: '1px solid var(--line)',
  },
  navBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--mist)',
    padding: '6px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  navBtnActive: {
    background: 'var(--current)',
    color: '#041824',
    fontWeight: 700,
    boxShadow: '0 0 10px rgba(32, 211, 194, 0.4)',
  },
};
