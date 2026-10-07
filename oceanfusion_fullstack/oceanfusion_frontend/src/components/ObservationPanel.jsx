import ProfileChart from './ProfileChart';

const rail = { background: 'var(--panel)', borderLeft: '1px solid var(--line)', padding: '16px 14px', overflowY: 'auto' };
const h3 = { fontSize: 11, color: 'var(--mist)', margin: '0 0 10px', fontWeight: 600, borderBottom: '1px solid var(--line)', paddingBottom: 8 };
const statLine = { display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px dashed var(--line)' };
const note = { fontSize: 11, color: 'var(--mist)', lineHeight: 1.5, marginTop: 14, padding: 10, background: 'var(--deep)', borderRadius: 5, border: '1px solid var(--line)' };

export default function ObservationPanel({
  selectedFloatId, profile, onCompare, compareResult,
  fleetStats, onRunFleet, floatCount, gliderCount = 0, depth, day,
}) {
  const isGliderId = selectedFloatId && (
    String(selectedFloatId).toUpperCase().includes('GLIDER') ||
    String(selectedFloatId).toUpperCase().includes('EGO') ||
    String(selectedFloatId).startsWith('6801')
  );

  return (
    <div style={rail}>
      <h3 style={h3}>Observation &amp; Model Comparison</h3>
      {!selectedFloatId && (
        <div style={{ fontSize: 12.5, color: 'var(--mist)', lineHeight: 1.6 }}>
          Click an Argo float or Glider marker in the 3D view to see its profile and compare it with the model.
        </div>
      )}
      {selectedFloatId && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: isGliderId ? '#00d2ff' : 'var(--current)', fontWeight: 700 }}>
              {isGliderId ? `✈️ Glider #${selectedFloatId}` : `Argo Float #${selectedFloatId}`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--foam)', background: 'rgba(32,211,194,0.15)', padding: '2px 8px', borderRadius: 4 }}>
              Day {day}
            </div>
          </div>

          {profile && (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--mist)', margin: '4px 0 6px' }}>
                {profile.lat.toFixed(2)}°N, {profile.lon.toFixed(2)}°E · {profile.variable === 'temp' ? 'Temperature' : 'Salinity'} Profile
              </div>
              <ProfileChart profile={profile} />
            </>
          )}

          {compareResult && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, color: 'var(--mist)' }}>Point Comparison @ depth {depth}m (Day {day})</div>
              <div style={{
                fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', margin: '4px 0 8px',
                color: Math.abs(compareResult.signed_error) > 1 ? 'var(--error)'
                  : Math.abs(compareResult.signed_error) > 0.4 ? 'var(--warn)' : '#8effc4',
              }}>
                {compareResult.signed_error >= 0 ? '+' : ''}{compareResult.signed_error.toFixed(2)}{compareResult.variable === 'temp' ? ' °C' : ' PSU'}
                <span style={{ fontSize: 11, color: 'var(--mist)', marginLeft: 8, fontWeight: 400 }}>(Error)</span>
              </div>
              <div style={statLine}><span>Model value</span><span style={{ fontFamily: 'var(--mono)', color: 'var(--current)', fontWeight: 600 }}>{compareResult.model_value.toFixed(2)} {compareResult.variable === 'temp' ? '°C' : 'PSU'}</span></div>
              <div style={statLine}><span>Observed value</span><span style={{ fontFamily: 'var(--mono)', color: '#ff9a56', fontWeight: 600 }}>{compareResult.observed_value.toFixed(2)} {compareResult.variable === 'temp' ? '°C' : 'PSU'}</span></div>
              <div style={statLine}><span>Matching method</span><span style={{ fontFamily: 'var(--mono)', fontSize: 10.5 }}>{compareResult.method}</span></div>
            </div>
          )}
        </div>
      )}

      <h3 style={{ ...h3, marginTop: 22 }}>Fleet &amp; Glider Statistics</h3>
      <div style={statLine}><span>Floats / Gliders in region</span><span style={{ fontFamily: 'var(--mono)' }}>{fleetStats?.n ?? ((floatCount || 0) + (gliderCount || 0)) ?? '—'}</span></div>
      <div style={statLine}><span>Bias (mean err.)</span><span style={{ fontFamily: 'var(--mono)' }}>{fleetStats ? signed(fleetStats.bias) : '—'}</span></div>
      <div style={statLine}><span>MAE</span><span style={{ fontFamily: 'var(--mono)' }}>{fleetStats ? fleetStats.mae.toFixed(2) : '—'}</span></div>
      <div style={statLine}><span>RMSE</span><span style={{ fontFamily: 'var(--mono)' }}>{fleetStats ? fleetStats.rmse.toFixed(2) : '—'}</span></div>
      <button className="gbtn" style={{ marginTop: 10 }} onClick={onRunFleet}>Run combined fleet comparison</button>
      <div style={note}>Statistics computed across all floats &amp; gliders at depth {depth}m &amp; day {day}.</div>
    </div>
  );
}

function signed(v) { return v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`; }
