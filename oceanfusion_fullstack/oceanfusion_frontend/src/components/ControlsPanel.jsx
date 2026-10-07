import { useState } from 'react';
import { uploadCSV } from '../services/api';

const rail = { background: 'var(--panel)', borderRight: '1px solid var(--line)', padding: '16px 14px', overflowY: 'auto' };
const h3 = { fontSize: 11, color: 'var(--mist)', margin: '0 0 10px', fontWeight: 600, borderBottom: '1px solid var(--line)', paddingBottom: 8 };
const row = { display: 'flex', alignItems: 'center', gap: 9, padding: '6px 2px', fontSize: 13, cursor: 'pointer' };
const swatch = (color) => ({ width: 10, height: 10, borderRadius: 2, flexShrink: 0, background: color });
const fieldGroup = { marginTop: 18 };
const label = { display: 'block', fontSize: 11.5, color: 'var(--mist)', marginBottom: 6 };
const note = { fontSize: 11, color: 'var(--mist)', lineHeight: 1.5, marginTop: 14, padding: 10, background: 'var(--deep)', borderRadius: 5, border: '1px solid var(--line)' };

export default function ControlsPanel({
  layers, onLayerChange, variable, onVariableChange, opacity, onOpacityChange,
  floats, gliders = [], selectedFloatId, onJumpToFloat, onExport, onRefreshFloats,
}) {
  const [uploadStatus, setUploadStatus] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Uploading...');
    try {
      const res = await uploadCSV(file);
      setUploadStatus(`Loaded ${res.floats_count} floats!`);
      if (onRefreshFloats) onRefreshFloats();
      setTimeout(() => setUploadStatus(''), 4000);
    } catch (err) {
      setUploadStatus('Upload failed');
      console.error(err);
    }
  };

  return (
    <div style={rail}>
      <h3 style={h3}>Layers</h3>
      <Toggle label="Scalar field" color="#3fb6ff" checked={layers.showField} onChange={v => onLayerChange('showField', v)} />
      <Toggle label="Currents" color="#20d3c2" checked={layers.showCurrents} onChange={v => onLayerChange('showCurrents', v)} />
      <Toggle label="Argo floats" color="#ff5d6c" checked={layers.showArgo} onChange={v => onLayerChange('showArgo', v)} />
      <Toggle label="Ocean gliders" color="#00d2ff" checked={layers.showGliders !== false} onChange={v => onLayerChange('showGliders', v)} />
      <Toggle label="Error map" color="#ff9a56" checked={layers.showErrGrid} onChange={v => onLayerChange('showErrGrid', v)} />
      <Toggle label="AI Anomaly Radar" color="#ff4252" checked={layers.showAnomalies} onChange={v => onLayerChange('showAnomalies', v)} />
      <Toggle label="Domain box" color="#41586a" checked={layers.showBox} onChange={v => onLayerChange('showBox', v)} />

      <div style={fieldGroup}>
        <label style={label}>Variable</label>
        <select value={variable} onChange={e => onVariableChange(e.target.value)}>
          <option value="temp">Temperature (°C)</option>
          <option value="sal">Salinity (PSU)</option>
          <option value="currents">Current Speed (m/s)</option>
        </select>
      </div>

      <div style={fieldGroup}>
        <label style={label}>Slice opacity</label>
        <input type="range" min="20" max="100" value={Math.round(opacity * 100)}
          onChange={e => onOpacityChange(Number(e.target.value) / 100)}
          style={{ width: '100%', accentColor: 'var(--current)' }} />
      </div>

      <div style={fieldGroup}>
        <label style={label}>Jump to Argo float</label>
        <select
          value={selectedFloatId ? String(selectedFloatId) : ''}
          onChange={e => e.target.value && onJumpToFloat(String(e.target.value))}
        >
          <option value="">— select Argo float —</option>
          {floats?.map(f => (
            <option key={String(f.id)} value={String(f.id)}>
              Argo #{f.id} ({f.lat.toFixed(1)}°N, {f.lon.toFixed(1)}°E)
            </option>
          ))}
        </select>
      </div>

      <div style={fieldGroup}>
        <label style={label}>Jump to Ocean Glider</label>
        <select
          value={selectedFloatId ? String(selectedFloatId) : ''}
          onChange={e => e.target.value && onJumpToFloat(String(e.target.value))}
        >
          <option value="">— select glider platform —</option>
          {gliders?.map(g => {
            const gId = String(g.platform_id || g.id);
            const lat = g.latitude ?? g.lat ?? 0;
            const lon = g.longitude ?? g.lon ?? 0;
            return (
              <option key={gId} value={gId}>
                ✈️ {gId} ({lat.toFixed(1)}°N, {lon.toFixed(1)}°E)
              </option>
            );
          })}
        </select>
      </div>


      <div style={fieldGroup}>
        <label style={label}>Upload CSV Dataset</label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          style={{ fontSize: 11, color: 'var(--mist)', width: '100%' }}
        />
        {uploadStatus && <div style={{ fontSize: 11, color: '#3fb6ff', marginTop: 4 }}>{uploadStatus}</div>}
      </div>

      <div style={fieldGroup}>
        <button className="gbtn" onClick={onExport}>Export screenshot</button>
      </div>

      <div style={note}>
        Model and Argo data are served live from the FastAPI backend
        (<code>/api/model/slice</code>, <code>/api/argo</code>). Currently
        loaded via <code>CSVArgoAdapter</code> using the downloaded ARGO CSV dataset.
      </div>
    </div>
  );
}

function Toggle({ label: text, color, checked, onChange }) {
  return (
    <label style={row}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ accentColor: 'var(--current)', width: 14, height: 14, cursor: 'pointer' }} />
      <span style={swatch(color)} />
      {text}
    </label>
  );
}
