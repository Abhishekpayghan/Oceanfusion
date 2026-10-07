import { useState } from 'react';

export default function AnomalyAlertsPanel({
  anomaliesData,
  anomalyStatus,
  onInspectFloat,
  onInjectSynthetic,
  onRetrainModel,
  onRefreshAnomalies,
  onClose,
}) {
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterSource, setFilterSource] = useState('ALL');
  const [isInjecting, setIsInjecting] = useState(false);
  const [isRetraining, setIsRetraining] = useState(false);

  const results = anomaliesData?.results || [];

  const filteredResults = results.filter(item => {
    if (filterSeverity !== 'ALL' && item.severity !== filterSeverity) return false;
    if (filterSource === 'REAL' && item.synthetic) return false;
    if (filterSource === 'SYNTHETIC' && !item.synthetic) return false;
    return true;
  });

  const highCount = results.filter(r => r.severity === 'HIGH').length;
  const medCount = results.filter(r => r.severity === 'MEDIUM').length;
  const normalCount = results.filter(r => r.anomaly_label === 'NORMAL').length;

  const handleInject = async () => {
    setIsInjecting(true);
    try {
      await onInjectSynthetic();
    } finally {
      setIsInjecting(false);
    }
  };

  const handleRetrain = async () => {
    setIsRetraining(true);
    try {
      await onRetrainModel();
    } finally {
      setIsRetraining(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Top Header */}
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <div style={styles.liveIndicator}>
            <span style={styles.pulseDot} />
            LIVE AI ANOMALY DETECTION
          </div>
          <h2 style={styles.title}>Ocean Model vs. Argo Profile Radar</h2>
          <p style={styles.subtitle}>
            Scikit-Learn <code>IsolationForest</code> analyzing physical residual vectors (
            <code>ΔTemp</code>, <code>ΔSalinity</code>, <code>Current Speed</code>, Depth &amp; Coordinates)
          </p>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.statusBadge}>
            Status: <b style={{ color: anomalyStatus?.model_trained ? '#3effb8' : '#ff9a56' }}>
              {anomalyStatus?.model_trained ? 'Model Trained (Active)' : 'Initializing...'}
            </b>
            {anomalyStatus?.trained_rows ? ` · ${anomalyStatus.trained_rows} observations` : ''}
          </div>
          {onClose && (
            <button style={styles.closeBtn} onClick={onClose} title="Close Panel">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>Total Checked</div>
          <div style={styles.metricValue}>{results.length}</div>
          <div style={styles.metricSub}>Current Region &amp; Depth</div>
        </div>

        <div style={{ ...styles.metricCard, borderLeft: '3px solid #ff4252' }}>
          <div style={styles.metricLabel}>High Severity</div>
          <div style={{ ...styles.metricValue, color: '#ff4252' }}>{highCount}</div>
          <div style={styles.metricSub}>ΔT &gt; 2.5°C or ML Score &lt; -0.15</div>
        </div>

        <div style={{ ...styles.metricCard, borderLeft: '3px solid #ffb834' }}>
          <div style={styles.metricLabel}>Medium Severity</div>
          <div style={{ ...styles.metricValue, color: '#ffb834' }}>{medCount}</div>
          <div style={styles.metricSub}>Moderate residual drift</div>
        </div>

        <div style={{ ...styles.metricCard, borderLeft: '3px solid #3effb8' }}>
          <div style={styles.metricLabel}>Normal Profiles</div>
          <div style={{ ...styles.metricValue, color: '#3effb8' }}>{normalCount}</div>
          <div style={styles.metricSub}>Within expected bounds</div>
        </div>
      </div>

      {/* Toolbar & Filters */}
      <div style={styles.toolbar}>
        <div style={styles.filterGroup}>
          <span style={styles.filterLabel}>Severity:</span>
          {['ALL', 'HIGH', 'MEDIUM', 'LOW'].map(sev => (
            <button
              key={sev}
              style={{
                ...styles.chip,
                ...(filterSeverity === sev ? styles.activeChip : {}),
              }}
              onClick={() => setFilterSeverity(sev)}
            >
              {sev}
            </button>
          ))}

          <span style={{ ...styles.filterLabel, marginLeft: 16 }}>Source:</span>
          {['ALL', 'REAL', 'SYNTHETIC'].map(src => (
            <button
              key={src}
              style={{
                ...styles.chip,
                ...(filterSource === src ? styles.activeChip : {}),
              }}
              onClick={() => setFilterSource(src)}
            >
              {src === 'REAL' ? 'Real INCOIS Argo' : src === 'SYNTHETIC' ? 'Synthetic Argo' : 'All Sources'}
            </button>
          ))}
        </div>

        <div style={styles.actionsGroup}>
          <button
            style={styles.actionBtnSecondary}
            onClick={handleInject}
            disabled={isInjecting}
            title="Inject a test thermal anomaly to verify live alert triggering"
          >
            {isInjecting ? 'Injecting...' : '⚡ Inject Demo Anomaly'}
          </button>

          <button
            style={styles.actionBtnPrimary}
            onClick={handleRetrain}
            disabled={isRetraining}
            title="Train Isolation Forest model on latest matched residual dataset"
          >
            {isRetraining ? 'Training Model...' : '🔄 Retrain ML Model'}
          </button>
        </div>
      </div>

      {/* Alerts Feed */}
      <div style={styles.feedContainer}>
        {filteredResults.length === 0 ? (
          <div style={styles.emptyState}>
            <div>🌊 No anomaly alerts matching selected filter criteria.</div>
            <div style={{ fontSize: 11, color: 'var(--mist)', marginTop: 4 }}>
              Click "⚡ Inject Demo Anomaly" to simulate a real-time observation surge.
            </div>
          </div>
        ) : (
          filteredResults.map((item, idx) => {
            const isHigh = item.severity === 'HIGH';
            const isMed = item.severity === 'MEDIUM';
            const isAnomaly = item.anomaly_label === 'POTENTIAL_ANOMALY';

            const cardBorderColor = isHigh ? '#ff4252' : isMed ? '#ffb834' : 'rgba(63,182,255,0.2)';
            const cardBg = isHigh ? 'rgba(255,66,82,0.06)' : isMed ? 'rgba(255,184,52,0.05)' : 'rgba(9,24,36,0.7)';

            return (
              <div
                key={`${item.platform_number}_${idx}`}
                style={{
                  ...styles.alertCard,
                  borderColor: cardBorderColor,
                  background: cardBg,
                }}
              >
                {/* Card Top Header */}
                <div style={styles.cardHeader}>
                  <div style={styles.floatInfo}>
                    <span style={styles.floatId}>Argo #{item.platform_number}</span>
                    <span style={styles.coords}>
                      {item.latitude?.toFixed(2)}°N, {item.longitude?.toFixed(2)}°E · Depth {item.depth}m
                    </span>
                  </div>

                  <div style={styles.badgeRow}>
                    <span
                      style={{
                        ...styles.sourceBadge,
                        background: item.synthetic ? 'rgba(63,182,255,0.15)' : 'rgba(62,255,184,0.15)',
                        color: item.synthetic ? '#3fb6ff' : '#3effb8',
                        borderColor: item.synthetic ? '#3fb6ff40' : '#3effb840',
                      }}
                    >
                      {item.synthetic ? 'SYNTHETIC ARGO' : 'REAL INCOIS ARGO'}
                    </span>

                    <span
                      style={{
                        ...styles.severityBadge,
                        background: isHigh ? '#ff4252' : isMed ? '#ffb834' : '#3fb6ff',
                      }}
                    >
                      {item.severity} {isAnomaly ? 'ANOMALY' : 'NORMAL'}
                    </span>
                  </div>
                </div>

                {/* Discrepancy Metrics Grid */}
                <div style={styles.discrepancyGrid}>
                  <div style={styles.discBox}>
                    <div style={styles.discTitle}>Temperature Deviation</div>
                    <div
                      style={{
                        ...styles.discValue,
                        color: item.temp_difference != null && Math.abs(item.temp_difference) > 1.5 ? '#ff4252' : '#ffffff',
                      }}
                    >
                      {item.temp_difference != null ? `${item.temp_difference >= 0 ? '+' : ''}${item.temp_difference.toFixed(2)} °C` : '—'}
                    </div>
                    <div style={styles.discSub}>
                      Model: {item.model_temp != null ? `${item.model_temp.toFixed(2)}°C` : '—'} | Obs: {item.argo_temp != null ? `${item.argo_temp.toFixed(2)}°C` : '—'}
                    </div>
                  </div>

                  <div style={styles.discBox}>
                    <div style={styles.discTitle}>Salinity Deviation</div>
                    <div
                      style={{
                        ...styles.discValue,
                        color: item.salinity_difference != null && Math.abs(item.salinity_difference) > 0.4 ? '#ffb834' : '#ffffff',
                      }}
                    >
                      {item.salinity_difference != null ? `${item.salinity_difference >= 0 ? '+' : ''}${item.salinity_difference.toFixed(2)} PSU` : '—'}
                    </div>
                    <div style={styles.discSub}>
                      Model: {item.model_salinity != null ? `${item.model_salinity.toFixed(2)} PSU` : '—'} | Obs: {item.argo_salinity != null ? `${item.argo_salinity.toFixed(2)} PSU` : '—'}
                    </div>
                  </div>

                  <div style={styles.discBox}>
                    <div style={styles.discTitle}>Isolation Forest Score</div>
                    <div style={{ ...styles.discValue, color: isAnomaly ? '#ff4252' : '#3effb8', fontFamily: 'var(--mono)' }}>
                      {item.anomaly_score != null ? item.anomaly_score.toFixed(3) : 'N/A'}
                    </div>
                    <div style={styles.discSub}>
                      {isAnomaly ? '⚠️ Flagged by ML Model' : '✓ Normal Profile'}
                    </div>
                  </div>
                </div>

                {/* Card Footer & Action */}
                <div style={styles.cardFooter}>
                  <div style={styles.flagNote}>
                    {item.synthetic_test_anomaly && (
                      <span style={{ color: '#ff4252', fontWeight: 600 }}>⚡ Demo Thermal Surge Injected &nbsp;|&nbsp; </span>
                    )}
                    {item.large_temp_diff && <span>Thermal inversion detected &nbsp;</span>}
                    {item.large_sal_diff && <span>Salinity gradient anomaly &nbsp;</span>}
                    {!item.large_temp_diff && !item.large_sal_diff && <span>Physical parameters verified against ocean model grid.</span>}
                  </div>

                  <button
                    style={styles.inspectBtn}
                    onClick={() => onInspectFloat(String(item.platform_number))}
                  >
                    🔍 Inspect Float #{item.platform_number} in 3D Scene
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'linear-gradient(180deg, rgba(6,20,31,0.98) 0%, rgba(2,10,16,0.98) 100%)',
    borderTop: '1px solid var(--line)',
    color: '#ffffff',
    padding: '16px 20px',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyConstraint: 'space-between',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  titleGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#ff4252',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: '#ff4252',
    boxShadow: '0 0 8px #ff4252',
    display: 'inline-block',
  },
  title: { margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--foam)' },
  subtitle: { margin: 0, fontSize: 11.5, color: 'var(--mist)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  statusBadge: {
    fontSize: 11.5,
    color: 'var(--mist)',
    background: 'rgba(15,58,82,0.5)',
    padding: '4px 10px',
    borderRadius: 4,
    border: '1px solid var(--line)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--mist)',
    fontSize: 16,
    cursor: 'pointer',
    padding: '2px 8px',
  },

  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 14,
  },
  metricCard: {
    background: 'rgba(9,24,36,0.8)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '10px 14px',
  },
  metricLabel: { fontSize: 11, color: 'var(--mist)' },
  metricValue: { fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)', margin: '2px 0' },
  metricSub: { fontSize: 10, color: 'var(--mist)' },

  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottom: '1px solid var(--line)',
  },
  filterGroup: { display: 'flex', alignItems: 'center', gap: 6 },
  filterLabel: { fontSize: 11.5, color: 'var(--mist)', marginRight: 4 },
  chip: {
    background: 'rgba(15,58,82,0.4)',
    border: '1px solid var(--line)',
    color: 'var(--mist)',
    fontSize: 11,
    padding: '3px 9px',
    borderRadius: 12,
    cursor: 'pointer',
  },
  activeChip: {
    background: 'var(--current)',
    color: '#020a10',
    borderColor: 'var(--current)',
    fontWeight: 600,
  },

  actionsGroup: { display: 'flex', alignItems: 'center', gap: 8 },
  actionBtnSecondary: {
    background: 'rgba(255,184,52,0.15)',
    border: '1px solid #ffb83460',
    color: '#ffb834',
    padding: '6px 12px',
    fontSize: 11.5,
    borderRadius: 5,
    fontWeight: 600,
    cursor: 'pointer',
  },
  actionBtnPrimary: {
    background: 'var(--current)',
    border: 'none',
    color: '#020a10',
    padding: '6px 12px',
    fontSize: 11.5,
    borderRadius: 5,
    fontWeight: 600,
    cursor: 'pointer',
  },

  feedContainer: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    paddingRight: 4,
  },
  emptyState: {
    textAlign: 'center',
    padding: '30px 20px',
    color: 'var(--mist)',
    fontSize: 13,
  },

  alertCard: {
    border: '1px solid',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    transition: 'all 0.2s ease',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floatInfo: { display: 'flex', alignItems: 'baseline', gap: 10 },
  floatId: { fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--foam)' },
  coords: { fontSize: 11, color: 'var(--mist)' },
  badgeRow: { display: 'flex', alignItems: 'center', gap: 6 },
  sourceBadge: {
    fontSize: 9.5,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 3,
    border: '1px solid',
    letterSpacing: '0.04em',
  },
  severityBadge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 3,
    color: '#020a10',
    letterSpacing: '0.04em',
  },

  discrepancyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    background: 'rgba(2,10,16,0.5)',
    padding: 8,
    borderRadius: 6,
  },
  discBox: { display: 'flex', flexDirection: 'column', gap: 2 },
  discTitle: { fontSize: 10.5, color: 'var(--mist)' },
  discValue: { fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)' },
  discSub: { fontSize: 9.5, color: 'var(--mist)' },

  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  flagNote: { fontSize: 11, color: 'var(--mist)' },
  inspectBtn: {
    background: 'rgba(63,182,255,0.15)',
    border: '1px solid #3fb6ff60',
    color: '#3fb6ff',
    padding: '4px 10px',
    fontSize: 11,
    borderRadius: 4,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
