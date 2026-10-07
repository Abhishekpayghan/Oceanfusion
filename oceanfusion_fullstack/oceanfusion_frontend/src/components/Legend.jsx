import { useMemo } from 'react';

function valueColor(variable, v) {
  const lerp = (a, b, t) => a + (b - a) * t;
  if (variable === 'temp') {
    const stops = [[0.0, [8, 28, 92]], [0.28, [10, 110, 170]], [0.55, [40, 190, 150]], [0.78, [240, 190, 60]], [1.0, [230, 60, 50]]];
    let x = (v - 2) / (32 - 2); x = Math.min(1, Math.max(0, x));
    for (let i = 0; i < stops.length - 1; i++) {
      if (x >= stops[i][0] && x <= stops[i + 1][0]) {
        const tt = (x - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        const c0 = stops[i][1], c1 = stops[i + 1][1];
        return [lerp(c0[0], c1[0], tt), lerp(c0[1], c1[1], tt), lerp(c0[2], c1[2], tt)];
      }
    }
    return stops[stops.length - 1][1];
  }
  if (variable === 'sal') {
    const stops = [[0.0, [20, 40, 110]], [0.5, [40, 140, 180]], [1.0, [210, 235, 235]]];
    let x = (v - 34.0) / (36.2 - 34.0); x = Math.min(1, Math.max(0, x));
    for (let i = 0; i < stops.length - 1; i++) {
      if (x >= stops[i][0] && x <= stops[i + 1][0]) {
        const tt = (x - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
        const c0 = stops[i][1], c1 = stops[i + 1][1];
        return [lerp(c0[0], c1[0], tt), lerp(c0[1], c1[1], tt), lerp(c0[2], c1[2], tt)];
      }
    }
    return stops[stops.length - 1][1];
  }
  // currents palette: deep blue -> cyan -> mint -> yellow -> red
  const stops = [[0.0, [10, 30, 80]], [0.25, [20, 140, 190]], [0.5, [40, 200, 160]], [0.75, [240, 210, 60]], [1.0, [235, 70, 50]]];
  let x = v / 1.5; x = Math.min(1, Math.max(0, x));
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) {
      const tt = (x - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const c0 = stops[i][1], c1 = stops[i + 1][1];
      return [lerp(c0[0], c1[0], tt), lerp(c0[1], c1[1], tt), lerp(c0[2], c1[2], tt)];
    }
  }
  return stops[stops.length - 1][1];
}

export default function Legend({ variable, range, depth = 0, bounds }) {
  // Effective range calculation with robust fallbacks
  const effectiveRange = useMemo(() => {
    if (range && range.min !== undefined && range.max !== undefined && !isNaN(range.min) && !isNaN(range.max)) {
      return { min: range.min, max: range.max };
    }
    if (variable === 'temp') return { min: 2.0, max: 31.8 };
    if (variable === 'sal') return { min: 34.0, max: 36.5 };
    return { min: 0.0, max: 1.45 }; // currents
  }, [range, variable]);

  const gradient = useMemo(() => {
    const stops = [];
    const minVal = effectiveRange.min;
    const maxVal = effectiveRange.max;
    for (let x = 0; x <= 10; x++) {
      const t = minVal + (x / 10) * (maxVal - minVal);
      const [r, g, b] = valueColor(variable, t);
      stops.push(`rgb(${r | 0},${g | 0},${b | 0}) ${x * 10}%`);
    }
    return `linear-gradient(90deg, ${stops.join(',')})`;
  }, [variable, effectiveRange]);

  const paramConfig = useMemo(() => {
    if (variable === 'temp') return { label: 'Temperature', unit: '°C', icon: '🌡️', color: '#ff5e62' };
    if (variable === 'sal') return { label: 'Salinity', unit: 'PSU', icon: '🧂', color: '#38ef7d' };
    return { label: 'Current Velocity', unit: 'm/s', icon: '🌊', color: '#3fb6ff' };
  }, [variable]);

  const midVal = (effectiveRange.min + effectiveRange.max) / 2;

  // Spatial bounds
  const latMin = bounds?.latMin ?? -5;
  const latMax = bounds?.latMax ?? 25;
  const lonMin = bounds?.lonMin ?? 50;
  const lonMax = bounds?.lonMax ?? 95;
  const maxDepth = bounds?.depthMax ?? 1000;
  const depthPct = Math.min(100, Math.max(0, (depth / maxDepth) * 100));

  return (
    <div style={styles.card}>
      {/* Header Badge */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <span style={{ marginRight: 6 }}>{paramConfig.icon}</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{paramConfig.label} Range</span>
        </div>
        <span style={{ ...styles.badge, borderColor: paramConfig.color, color: paramConfig.color }}>
          {paramConfig.unit}
        </span>
      </div>

      {/* Colorbar Gradient Scale */}
      <div style={styles.colorbarContainer}>
        <div style={{ ...styles.colorbar, background: gradient }} />
        <div style={styles.colorbarPointer} />
      </div>

      {/* Parameter Range Min / Mid / Max values */}
      <div style={styles.scaleLabels}>
        <div style={styles.scaleCol}>
          <span style={styles.scaleSub}>MIN</span>
          <span style={styles.scaleVal}>{effectiveRange.min.toFixed(1)} {paramConfig.unit}</span>
        </div>
        <div style={{ ...styles.scaleCol, textAlign: 'center' }}>
          <span style={styles.scaleSub}>MID</span>
          <span style={styles.scaleVal}>{midVal.toFixed(1)} {paramConfig.unit}</span>
        </div>
        <div style={{ ...styles.scaleCol, textAlign: 'right' }}>
          <span style={styles.scaleSub}>MAX</span>
          <span style={styles.scaleVal}>{effectiveRange.max.toFixed(1)} {paramConfig.unit}</span>
        </div>
      </div>

      <div style={styles.divider} />

      {/* Depth & Coordinate Range Details */}
      <div style={styles.rangeDetails}>
        <div style={styles.rangeRow}>
          <span style={styles.rangeLabel}>Depth Plane:</span>
          <span style={styles.rangeValue}>
            <b>{depth}m</b> <span style={styles.rangeSub}>(Range: 0 – {maxDepth}m)</span>
          </span>
        </div>

        {/* Depth Bar Visualizer */}
        <div style={styles.depthTrack}>
          <div style={{ ...styles.depthFill, width: `${depthPct}%` }} />
        </div>

        <div style={{ ...styles.rangeRow, marginTop: 6 }}>
          <span style={styles.rangeLabel}>Lat Range:</span>
          <span style={styles.rangeValue}>{latMin}° to {latMax}° N</span>
        </div>

        <div style={styles.rangeRow}>
          <span style={styles.rangeLabel}>Lon Range:</span>
          <span style={styles.rangeValue}>{lonMin}° to {lonMax}° E</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  card: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 240,
    background: 'rgba(5, 18, 30, 0.88)',
    border: '1px solid rgba(63, 182, 255, 0.35)',
    borderRadius: 10,
    padding: '12px 14px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(63, 182, 255, 0.15)',
    backdropFilter: 'blur(10px)',
    zIndex: 20,
    fontFamily: 'Inter, system-ui, sans-serif',
    pointerEvents: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 12,
    letterSpacing: '0.02em',
    display: 'flex',
    alignItems: 'center',
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 4,
    border: '1px solid',
    background: 'rgba(0,0,0,0.3)',
    fontFamily: 'var(--mono, monospace)',
  },
  colorbarContainer: {
    position: 'relative',
    marginBottom: 6,
  },
  colorbar: {
    height: 12,
    borderRadius: 6,
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.3)',
  },
  colorbarPointer: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 2,
    background: '#fff',
    display: 'none',
  },
  scaleLabels: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    marginBottom: 10,
  },
  scaleCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  scaleSub: {
    fontSize: 8.5,
    color: '#8aa2b3',
    fontWeight: 600,
    letterSpacing: '0.05em',
  },
  scaleVal: {
    fontSize: 11,
    fontWeight: 700,
    color: '#e2f3ff',
    fontFamily: 'var(--mono, monospace)',
  },
  divider: {
    height: 1,
    background: 'linear-gradient(90deg, transparent, rgba(63, 182, 255, 0.25), transparent)',
    margin: '8px 0',
  },
  rangeDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  rangeRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 10.5,
  },
  rangeLabel: {
    color: '#8aa2b3',
    fontSize: 10,
  },
  rangeValue: {
    color: '#e2f3ff',
    fontFamily: 'var(--mono, monospace)',
    fontSize: 10.5,
  },
  rangeSub: {
    color: '#5e7e94',
    fontSize: 9.5,
    fontWeight: 400,
  },
  depthTrack: {
    height: 3,
    width: '100%',
    background: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
    marginBottom: 2,
  },
  depthFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3fb6ff, #38ef7d)',
    borderRadius: 2,
    transition: 'width 0.3s ease',
  },
};
