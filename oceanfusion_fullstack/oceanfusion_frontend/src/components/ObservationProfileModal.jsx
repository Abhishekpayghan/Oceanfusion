import React, { useEffect, useState } from 'react';
import ProfileChart from './ProfileChart';
import * as api from '../services/api';

export default function ObservationProfileModal({ observation, onClose, onStudyIn3D }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [variable, setVariable] = useState('temp');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!observation?.id) return;
    setLoading(true);
    setError(null);

    api.fetchFloatProfile({ floatId: observation.id, variable, day: observation.last_cycle_day || 1 })
      .then(res => {
        setProfile(res);
        setLoading(false);
      })
      .catch(err => {
        console.error("Profile fetch error:", err);
        setError("Unable to load profile dataset for this platform.");
        setLoading(false);
      });
  }, [observation, variable]);

  if (!observation) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <div>
            <div style={styles.title}>Vertical Depth Profile</div>
            <div style={styles.subTitle}>
              Platform #{observation.id} ({fmtLat(observation.latitude)}, {fmtLon(observation.longitude)})
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={styles.modalBody}>
          <div style={styles.varSwitcher}>
            <button
              style={{
                ...styles.swBtn,
                ...(variable === 'temp' ? styles.swBtnActive : {}),
              }}
              onClick={() => setVariable('temp')}
            >
              🌡️ Temperature (°C)
            </button>

            <button
              style={{
                ...styles.swBtn,
                ...(variable === 'sal' ? styles.swBtnActive : {}),
              }}
              onClick={() => setVariable('sal')}
            >
              🧂 Salinity (PSU)
            </button>
          </div>

          {loading && <div style={styles.loading}>Loading observation profile data...</div>}
          {error && <div style={styles.error}>{error}</div>}

          {!loading && !error && profile && (
            <div style={styles.chartContainer}>
              <ProfileChart profile={profile} />
              
              <div style={styles.statsSummary}>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Surface Obs</div>
                  <div style={styles.statVal}>
                    {profile.observed?.[0]?.toFixed(2)} {variable === 'temp' ? '°C' : 'PSU'}
                  </div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Model Surface</div>
                  <div style={styles.statVal}>
                    {profile.model?.[0]?.toFixed(2)} {variable === 'temp' ? '°C' : 'PSU'}
                  </div>
                </div>
                <div style={styles.statBox}>
                  <div style={styles.statLabel}>Surface Difference</div>
                  <div style={{
                    ...styles.statVal,
                    color: Math.abs(profile.observed?.[0] - profile.model?.[0]) > 0.5 ? 'var(--warn)' : 'var(--current)'
                  }}>
                    {(profile.observed?.[0] - profile.model?.[0])?.toFixed(2)} {variable === 'temp' ? '°C' : 'PSU'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={styles.modalFooter}>
          <button style={styles.secondaryBtn} onClick={onClose}>Close</button>
          <button style={styles.primaryBtn} onClick={() => { onClose(); onStudyIn3D?.(observation); }}>
            🧊 Study in 3D Ocean Cube →
          </button>
        </div>
      </div>
    </div>
  );
}

function fmtLat(v) { return v != null ? `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}` : '—'; }
function fmtLon(v) { return v != null ? `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}` : '—'; }

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    width: 520,
    maxWidth: '90vw',
    background: 'rgba(4, 20, 32, 0.96)',
    border: '1px solid var(--line)',
    borderRadius: 12,
    boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
    color: 'var(--foam)',
    fontFamily: 'var(--font)',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justify: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--line)',
    background: 'rgba(255,255,255,0.03)',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--foam)',
  },
  subTitle: {
    fontSize: 12,
    color: 'var(--mist)',
    marginTop: 2,
    fontFamily: 'var(--mono)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--mist)',
    fontSize: 16,
    cursor: 'pointer',
  },
  modalBody: {
    padding: 20,
  },
  varSwitcher: {
    display: 'flex',
    gap: 10,
    marginBottom: 14,
  },
  swBtn: {
    flex: 1,
    padding: '7px 12px',
    fontSize: 12,
    fontWeight: 600,
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--line)',
    color: 'var(--foam)',
    borderRadius: 6,
    cursor: 'pointer',
  },
  swBtnActive: {
    background: 'var(--current)',
    color: '#041824',
    borderColor: 'var(--current)',
    fontWeight: 700,
  },
  loading: {
    textAlign: 'center',
    padding: '40px 0',
    color: 'var(--mist)',
    fontSize: 13,
  },
  error: {
    textAlign: 'center',
    padding: '20px 0',
    color: 'var(--error)',
    fontSize: 13,
  },
  chartContainer: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    border: '1px solid var(--line)',
  },
  statsSummary: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTop: '1px dashed var(--line)',
  },
  statBox: {
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 10.5,
    color: 'var(--mist)',
  },
  statVal: {
    fontFamily: 'var(--mono)',
    fontSize: 13,
    fontWeight: 700,
    color: 'var(--foam)',
    marginTop: 2,
  },
  modalFooter: {
    display: 'flex',
    justify: 'space-between',
    padding: '14px 20px',
    borderTop: '1px solid var(--line)',
    background: 'rgba(255,255,255,0.02)',
  },
  primaryBtn: {
    background: 'linear-gradient(135deg, #20d3c2 0%, #0d988a 100%)',
    color: '#041824',
    border: 'none',
    padding: '8px 16px',
    fontSize: 12.5,
    fontWeight: 700,
    borderRadius: 6,
    cursor: 'pointer',
  },
  secondaryBtn: {
    background: 'transparent',
    border: '1px solid var(--line)',
    color: 'var(--mist)',
    padding: '8px 16px',
    fontSize: 12,
    borderRadius: 6,
    cursor: 'pointer',
  },
};
