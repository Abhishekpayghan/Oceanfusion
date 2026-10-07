import React from 'react';

export default function GlobeInfoPanel({
  observation,
  onClose,
  onViewProfile,
  onStudyIn3D,
  onCompareWithModel,
}) {
  if (!observation) return null;

  const {
    id,
    type = 'argo',
    latitude,
    longitude,
    last_cycle_day = 1,
    time,
    depth = 0,
    variables = {},
    source = 'INCOIS ERDDAP Feed',
    network,
    oxygen,
    chlorophyll,
  } = observation;

  const temp = variables.temperature != null ? variables.temperature : observation.temperature;
  const sal = variables.salinity != null ? variables.salinity : observation.salinity;
  const oxy = oxygen != null ? oxygen : observation.oxygen;
  const chla = chlorophyll != null ? chlorophyll : observation.chlorophyll;

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={styles.titleRow}>
          <span style={styles.typeBadge}>
            {type === 'argo' ? '📡 ARGO FLOAT' : type === 'glider' ? '✈️ COPERNICUS GLIDER' : '⚓ MOORED BUOY'}
          </span>
          <span style={styles.floatId}>#{id}</span>
        </div>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div style={styles.body}>
        <div style={styles.gridRow}>
          <span style={styles.label}>Network / Type:</span>
          <span style={styles.value}>{network || (type === 'glider' ? 'EGO Network' : 'INCOIS Net')}</span>
        </div>
        <div style={styles.gridRow}>
          <span style={styles.label}>Position:</span>
          <span style={styles.value}>{fmtLat(latitude)} {fmtLon(longitude)}</span>
        </div>
        {time && (
          <div style={styles.gridRow}>
            <span style={styles.label}>Last Update:</span>
            <span style={styles.value}>{String(time).substring(0, 19).replace('T', ' ')} UTC</span>
          </div>
        )}
        <div style={styles.gridRow}>
          <span style={styles.label}>Observation Depth:</span>
          <span style={styles.value}>{depth} m</span>
        </div>
        <div style={styles.gridRow}>
          <span style={styles.label}>Data Source:</span>
          <span style={{
            ...styles.valueHighlight,
            color: source.includes('COPERNICUS') ? '#00ff88' : '#ffe052',
          }}>
            {source.includes('COPERNICUS') ? 'Copernicus Marine NRT' : source}
          </span>
        </div>

        <div style={styles.divider} />

        <div style={styles.metricsRow}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Temperature</div>
            <div style={styles.metricValTemp}>
              {temp != null ? `${Number(temp).toFixed(1)} °C` : '—'}
            </div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Salinity</div>
            <div style={styles.metricValSal}>
              {sal != null ? `${Number(sal).toFixed(1)} PSU` : '—'}
            </div>
          </div>
        </div>

        {(oxy != null || chla != null) && (
          <div style={styles.metricsRow}>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Oxygen (DOXY)</div>
              <div style={{ ...styles.metricValSal, color: '#00f0ff' }}>
                {oxy != null ? `${Number(oxy).toFixed(1)} µmol/kg` : '—'}
              </div>
            </div>
            <div style={styles.metricCard}>
              <div style={styles.metricLabel}>Chlorophyll-A</div>
              <div style={{ ...styles.metricValSal, color: '#a3e635' }}>
                {chla != null ? `${Number(chla).toFixed(2)} mg/m³` : '—'}
              </div>
            </div>
          </div>
        )}

        <div style={styles.actionCol}>
          <button style={styles.primaryBtn} onClick={() => onStudyIn3D(observation)}>
            🧊 View in 3D Ocean →
          </button>
          <button style={styles.secondaryBtn} onClick={() => onViewProfile(observation)}>
            📊 View Depth Profile
          </button>
          {onCompareWithModel && (
            <button style={styles.secondaryBtn} onClick={() => onCompareWithModel(observation)}>
              ⚡ Compare With Model
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtLat(v) { return v != null ? `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}` : '—'; }
function fmtLon(v) { return v != null ? `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}` : '—'; }

const styles = {
  card: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 320,
    background: 'rgba(6, 26, 44, 0.94)',
    backdropFilter: 'blur(16px)',
    border: '1px solid #00f0ff',
    borderRadius: 12,
    color: '#ffffff',
    zIndex: 25,
    boxShadow: '0 12px 36px rgba(0, 240, 255, 0.25)',
    fontFamily: 'var(--font)',
    overflow: 'hidden',
  },
  cardHeader: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'rgba(0, 240, 255, 0.08)',
    borderBottom: '1px solid rgba(0, 240, 255, 0.25)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    fontSize: 11,
    fontWeight: 800,
    color: '#00f0ff',
    letterSpacing: '0.05em',
  },
  floatId: {
    fontFamily: 'var(--mono)',
    fontSize: 14,
    fontWeight: 800,
    color: '#ffe052',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#8fb4c4',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  body: {
    padding: 16,
  },
  gridRow: {
    display: 'flex',
    justify: 'space-between',
    fontSize: 12,
    padding: '4px 0',
  },
  label: {
    color: '#8fb4c4',
  },
  value: {
    fontFamily: 'var(--mono)',
    color: '#ffffff',
    fontWeight: 600,
  },
  valueHighlight: {
    fontFamily: 'var(--mono)',
    color: '#00ff88',
    fontWeight: 700,
    fontSize: 11.5,
  },
  divider: {
    height: 1,
    background: 'rgba(0, 240, 255, 0.2)',
    margin: '12px 0',
  },
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginBottom: 14,
  },
  metricCard: {
    background: 'rgba(2, 12, 22, 0.6)',
    border: '1px solid rgba(0, 240, 255, 0.2)',
    borderRadius: 8,
    padding: '8px 10px',
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#8fb4c4',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metricValTemp: {
    fontFamily: 'var(--mono)',
    fontSize: 15,
    fontWeight: 800,
    color: '#ff9a56',
  },
  metricValSal: {
    fontFamily: 'var(--mono)',
    fontSize: 15,
    fontWeight: 800,
    color: '#00f0ff',
  },
  actionCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #00f0ff 0%, #0088ff 100%)',
    color: '#03101d',
    border: 'none',
    padding: '10px 14px',
    fontSize: 12.5,
    fontWeight: 800,
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'center',
    boxShadow: '0 4px 14px rgba(0, 240, 255, 0.35)',
    transition: 'all 0.15s ease',
  },
  secondaryBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(0, 240, 255, 0.3)',
    color: '#ffffff',
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'center',
  },
};
