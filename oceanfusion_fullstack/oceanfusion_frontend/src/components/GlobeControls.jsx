import React, { useState } from 'react';

const presetRegions = [
  { label: 'Entire Indian Ocean', lat: 0, lon: 75, zoom: 1.0, key: 'all' },
  { label: 'Arabian Sea', lat: 17, lon: 65, zoom: 2.2, key: 'arabian_sea' },
  { label: 'Bay of Bengal', lat: 15, lon: 89, zoom: 2.2, key: 'bay_of_bengal' },
  { label: 'Equatorial IO', lat: 0, lon: 75, zoom: 1.8, key: 'equatorial_io' },
  { label: 'Southern IO', lat: -20, lon: 85, zoom: 1.8, key: 'south_io' },
];

export default function GlobeControls({
  layerToggles,
  onToggleLayer,
  onShowAll,
  onHideAll,
  counts,
  layerStatus,
  searchId,
  onSearchChange,
  onSelectPreset,
  viewType = 'globe',
  onChangeViewType,
  onRefresh,
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={styles.panel}>
      <div style={styles.header} onClick={() => setExpanded(!expanded)}>
        <span style={styles.title}>📡 INCOIS OBSERVATION FEEDS</span>
        <span style={styles.toggleIcon}>{expanded ? '▼' : '▲'}</span>
      </div>

      {expanded && (
        <div style={styles.content}>
          {/* View Projection Switcher */}
          <div style={styles.sectionTitle}>Display Projection Mode</div>
          <div style={styles.projRow}>
            <button
              style={{
                ...styles.projBtn,
                ...(viewType === 'globe' ? styles.projBtnActive : {}),
              }}
              onClick={() => onChangeViewType?.('globe')}
            >
              🌐 3D INCOIS Globe
            </button>
            <button
              style={{
                ...styles.projBtn,
                ...(viewType === 'map' ? styles.projBtnActive : {}),
              }}
              onClick={() => onChangeViewType?.('map')}
            >
              🗺️ 2D INCOIS Map
            </button>
          </div>

          {/* Quick Preset Focus Buttons */}
          <div style={styles.sectionTitle}>Indian Ocean Sectors</div>
          <div style={styles.presetGrid}>
            {presetRegions.map(p => (
              <button
                key={p.key}
                style={styles.presetBtn}
                onClick={() => onSelectPreset?.(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={styles.sectionTitle}>Search Observation Platform</div>
          <input
            type="text"
            placeholder="Search float ID e.g. 2903951..."
            value={searchId}
            onChange={(e) => onSearchChange?.(e.target.value)}
            style={styles.searchInput}
          />

          {/* Layer Checkboxes */}
          <div style={styles.sectionTitle}>Observation Feeds</div>
          
          <LayerRow
            label="Argo Float Fleet"
            symbol="📡"
            checked={layerToggles.argo}
            onChange={(v) => onToggleLayer('argo', v)}
            count={counts?.argo ?? 0}
            badgeText="LIVE DATA"
            badgeColor="#00f0ff"
          />

          <LayerRow
            label="Ocean Gliders"
            symbol="✈️"
            checked={layerToggles.glider}
            onChange={(v) => onToggleLayer('glider', v)}
            count={counts?.glider ?? 0}
            badgeText={layerStatus?.glider?.source === 'COPERNICUS_NRT' ? 'COPERNICUS NRT' : 'EGO GLIDER'}
            badgeColor="#00d2ff"
          />

          <LayerRow
            label="Moored Buoys"
            symbol="⚓"
            checked={layerToggles.buoy}
            onChange={(v) => onToggleLayer('buoy', v)}
            count={counts?.buoy ?? 0}
            badgeText="RAMA / OMNI"
            badgeColor="#ffcc00"
          />

          <LayerRow
            label="CTD Casts"
            symbol="🧪"
            checked={layerToggles.ctd}
            onChange={(v) => onToggleLayer('ctd', v)}
            count={counts?.ctd ?? 0}
            badgeText="CRUISE"
            badgeColor="#ff3b5c"
          />

          <LayerRow
            label="BGC Sensors"
            symbol="🟣"
            checked={layerToggles.bgc}
            onChange={(v) => onToggleLayer('bgc', v)}
            count={counts?.bgc ?? 0}
            badgeText="BIO-ARGO"
            badgeColor="#d977f6"
          />

          <div style={styles.btnRow}>
            <button style={styles.smallBtn} onClick={onShowAll}>Show All</button>
            <button style={styles.smallBtnSecondary} onClick={onHideAll}>Hide All</button>
            {onRefresh && (
              <button style={{ ...styles.smallBtn, background: '#00d2ff', color: '#03101d' }} onClick={onRefresh}>
                🔄 Refresh NRT
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LayerRow({ label, symbol, checked, onChange, count, badgeText, badgeColor }) {
  return (
    <label style={styles.layerRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={styles.checkbox}
      />
      <span style={{ fontSize: 13, marginRight: 6 }}>{symbol}</span>
      <span style={styles.layerLabel}>{label}</span>
      <span style={{ ...styles.badge, color: badgeColor, borderColor: badgeColor, background: `${badgeColor}18` }}>
        {badgeText} {count > 0 ? `(${count})` : ''}
      </span>
    </label>
  );
}

const styles = {
  panel: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 270,
    background: 'rgba(6, 26, 44, 0.9)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(0, 240, 255, 0.4)',
    borderRadius: 10,
    color: '#ffffff',
    zIndex: 20,
    fontFamily: 'var(--font)',
    boxShadow: '0 10px 32px rgba(0, 240, 255, 0.18)',
  },
  header: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    padding: '11px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(0, 240, 255, 0.25)',
    background: 'rgba(255,255,255,0.03)',
  },
  title: {
    fontSize: 11.5,
    fontWeight: 800,
    letterSpacing: '0.06em',
    color: '#00f0ff',
  },
  toggleIcon: {
    fontSize: 10,
    color: '#00f0ff',
  },
  content: {
    padding: 12,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    color: '#8fb4c4',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 6,
    letterSpacing: '0.04em',
  },
  presetGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    marginBottom: 10,
  },
  presetBtn: {
    background: 'rgba(0, 240, 255, 0.08)',
    border: '1px solid rgba(0, 240, 255, 0.25)',
    color: '#ffffff',
    padding: '5px 6px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 5,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  projRow: {
    display: 'flex',
    gap: 6,
    marginBottom: 10,
  },
  projBtn: {
    flex: 1,
    padding: '7px 8px',
    fontSize: 11.5,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(0, 240, 255, 0.25)',
    color: '#8fb4c4',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  projBtnActive: {
    background: 'linear-gradient(135deg, rgba(0, 240, 255, 0.3) 0%, rgba(0, 136, 255, 0.3) 100%)',
    border: '1px solid #00f0ff',
    color: '#ffffff',
    fontWeight: 800,
    boxShadow: '0 0 12px rgba(0, 240, 255, 0.3)',
  },
  searchInput: {
    width: '100%',
    background: 'rgba(2, 12, 22, 0.7)',
    border: '1px solid rgba(0, 240, 255, 0.3)',
    color: '#ffffff',
    borderRadius: 5,
    padding: '7px 10px',
    fontSize: 11.5,
    marginBottom: 10,
    outline: 'none',
  },
  layerRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 0',
    fontSize: 12,
    cursor: 'pointer',
  },
  checkbox: {
    accentColor: '#00f0ff',
    width: 15,
    height: 15,
    marginRight: 6,
  },
  layerLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    color: '#e4f5ff',
  },
  badge: {
    fontSize: 9.5,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 5,
    border: '1px solid',
  },
  btnRow: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  },
  smallBtn: {
    flex: 1,
    background: 'linear-gradient(135deg, #00f0ff 0%, #0088ff 100%)',
    border: 'none',
    color: '#03101d',
    fontSize: 11.5,
    fontWeight: 800,
    padding: '6px 0',
    borderRadius: 5,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0, 240, 255, 0.3)',
  },
  smallBtnSecondary: {
    flex: 1,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#8fb4c4',
    fontSize: 11,
    fontWeight: 600,
    padding: '6px 0',
    borderRadius: 5,
    cursor: 'pointer',
  },
};
