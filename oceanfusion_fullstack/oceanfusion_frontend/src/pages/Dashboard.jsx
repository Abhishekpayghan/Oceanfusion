import { useEffect, useState, useCallback, useMemo } from 'react';
import Header from '../components/Header';
import ControlsPanel from '../components/ControlsPanel';
import ObservationPanel from '../components/ObservationPanel';
import SliderBar from '../components/SliderBar';
import Legend from '../components/Legend';
import OceanScene from '../components/OceanScene';
import AnomalyAlertsPanel from '../components/AnomalyAlertsPanel';
import * as api from '../services/api';

export default function Dashboard({ region, onChangeRegion, initialFloatId = null, viewMode = 'analysis', onSelectView }) {
  // ---- view state ----
  const [variable, setVariable] = useState('temp');
  const [depth, setDepth] = useState(0);
  const [day, setDay] = useState(1);
  const [nDays, setNDays] = useState(7);
  const [opacity, setOpacity] = useState(0.7);
  const [layers, setLayers] = useState({
    showField: true, showCurrents: false, showArgo: true, showGliders: true, showErrGrid: false, showAnomalies: true, showBox: true,
  });

  // ---- backend-derived data ----
  const [apiOk, setApiOk] = useState(true);
  const [regionMeta, setRegionMeta] = useState(null); // {region_key, region_label, region: {lat_min,...}, depth_levels}
  const [sliceData, setSliceData] = useState(null);
  const [sliceRange, setSliceRange] = useState(null);
  const [currentsData, setCurrentsData] = useState(null);
  const [floats, setFloats] = useState(null);
  const [gliders, setGliders] = useState([]);
  const [selectedFloatId, setSelectedFloatId] = useState(initialFloatId ? String(initialFloatId) : null);
  const [profile, setProfile] = useState(null);
  const [compareResult, setCompareResult] = useState(null);
  const [fleetStats, setFleetStats] = useState(null);
  const [errorByFloat, setErrorByFloat] = useState(null);

  // ---- live anomaly detection state ----
  const [showAnomalyPanel, setShowAnomalyPanel] = useState(false);
  const [anomaliesData, setAnomaliesData] = useState(null);
  const [anomalyStatus, setAnomalyStatus] = useState(null);

  // set initial float ID if passed from Globe Study in 3D
  useEffect(() => {
    if (initialFloatId) {
      setSelectedFloatId(String(initialFloatId));
    }
  }, [initialFloatId]);

  // reset view-local state whenever the region changes so stale data from
  // the previous region never flashes on screen
  useEffect(() => {
    setSliceData(null); setCurrentsData(null); setFloats(null); setGliders([]);
    setSelectedFloatId(initialFloatId ? String(initialFloatId) : null);
    setProfile(null); setCompareResult(null);
    setFleetStats(null); setErrorByFloat(null); setRegionMeta(null);
    setAnomaliesData(null);
  }, [region]);

  // metadata for the selected region (bbox, day count) + float list + glider list
  useEffect(() => {
    api.fetchMetadata({ region }).then(m => { setNDays(m.n_days); setRegionMeta(m); }).catch(() => setApiOk(false));
    api.fetchFloats({ region }).then(r => {
      setFloats(r.floats);
      if (r.floats && r.floats.length > 0) {
        setSelectedFloatId(prev => prev || String(r.floats[0].id));
      }
    }).catch(() => setApiOk(false));
    api.fetchGliders().then(r => {
      if (r && r.observations) setGliders(r.observations);
    }).catch(() => {});
    api.fetchAnomalyStatus().then(setAnomalyStatus).catch(() => {});
  }, [region]);

  // fetch live anomaly detection results
  const loadAnomalies = useCallback((injectSynthetic = false) => {
    api.fetchAnomalyDetect({ region, depth, day, injectSyntheticAnomaly: injectSynthetic })
      .then(res => setAnomaliesData(res))
      .catch(err => console.error("Anomaly detect error:", err));
  }, [region, depth, day]);

  // UNIFIED ATOMIC LOADER: Synchronizes 3D scene, profile chart, compare metrics, and anomaly radar
  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const sliceReq = api.fetchSlice({ variable, depth, day, region, signal });
    const profileReq = selectedFloatId ? api.fetchFloatProfile({ floatId: selectedFloatId, variable, day, region, signal }) : Promise.resolve(null);
    const compareReq = selectedFloatId ? api.fetchCompare({ floatId: selectedFloatId, variable, depth, day, region, signal }) : Promise.resolve(null);
    const anomalyReq = api.fetchAnomalyDetect({ region, depth, day, injectSyntheticAnomaly: false, signal });
    const currentsReq = layers.showCurrents ? api.fetchCurrents({ day, region, signal }) : Promise.resolve(null);
    const fleetReq = fleetStats ? api.fetchFleetStats({ variable, depth, day, region, signal }) : Promise.resolve(null);

    Promise.all([sliceReq, profileReq, compareReq, anomalyReq, currentsReq, fleetReq])
      .then(([sliceData, profData, compData, anomData, currData, fleetData]) => {
        // Atomic React State Batch Update - All components re-render TOGETHER in a single frame!
        if (sliceData) { setSliceData(sliceData); setApiOk(true); }
        if (selectedFloatId) {
          if (profData) setProfile(profData);
          if (compData) setCompareResult(compData);
        }
        if (anomData) setAnomaliesData(anomData);
        if (currData) setCurrentsData(currData);
        if (fleetData) { setFleetStats(fleetData); setErrorByFloat(fleetData.per_float_error); }
      })
      .catch(err => {
        if (err.name !== 'AbortError') setApiOk(false);
      });

    return () => controller.abort();
  }, [day, variable, depth, region, selectedFloatId, layers.showCurrents, fleetStats ? true : false]);

  const handleLayerChange = useCallback((key, value) => {
    setLayers(prev => {
      const updated = { ...prev, [key]: value };
      if (key === 'showAnomalies' && value) setShowAnomalyPanel(true);
      return updated;
    });
  }, []);

  const handleCompare = useCallback(() => {
    if (!selectedFloatId) return;
    api.fetchCompare({ floatId: selectedFloatId, variable, depth, day, region })
      .then(setCompareResult)
      .catch(err => console.error("Compare error:", err));
  }, [selectedFloatId, variable, depth, day, region]);

  const handleRunFleet = useCallback(() => {
    api.fetchFleetStats({ variable, depth, day, region }).then(res => {
      setFleetStats(res);
      setErrorByFloat(res.per_float_error);
      setLayers(prev => ({ ...prev, showErrGrid: true }));
    }).catch(() => {});
  }, [variable, depth, day, region]);

  const handleExport = useCallback(() => {
    const canvas = document.querySelector('#scene-host canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'oceanfusion_snapshot.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const refreshFloats = useCallback(() => {
    api.fetchFloats({ region }).then(r => setFloats(r.floats)).catch(() => {});
  }, [region]);

  const handleRetrainModel = useCallback(async () => {
    const report = await api.trainAnomalyModel();
    api.fetchAnomalyStatus().then(setAnomalyStatus).catch(() => {});
    loadAnomalies(false);
    return report;
  }, [loadAnomalies]);

  // Extract anomalous float IDs for 3D marker highlighting
  const anomalousFloatIds = useMemo(() => {
    if (!anomaliesData?.results) return [];
    return anomaliesData.results
      .filter(r => r.anomaly_label === 'POTENTIAL_ANOMALY' || r.severity === 'HIGH')
      .map(r => String(r.platform_number));
  }, [anomaliesData]);

  // Bounding box that drives the 3D scene's coordinate mapping
  const bounds = useMemo(() => {
    const r = regionMeta?.region;
    if (!r) return null;
    return {
      latMin: r.lat_min, latMax: r.lat_max,
      lonMin: r.lon_min, lonMax: r.lon_max,
      depthMax: Math.max(...(regionMeta.depth_levels || [1000])),
    };
  }, [regionMeta]);

  const regionLabel = regionMeta?.region_label || region;
  const anomalyCount = anomaliesData?.potential_anomaly_count || 0;

  return (
    <div style={{ display: 'grid', gridTemplateRows: '56px 1fr 96px', height: '100vh' }}>
      <Header
        variable={variable} depth={depth} day={day} nDays={nDays} apiOk={apiOk}
        regionLabel={regionLabel} bounds={bounds} onChangeRegion={onChangeRegion}
        anomalyCount={anomalyCount}
        showAnomalyPanel={showAnomalyPanel}
        onToggleAnomalyPanel={() => setShowAnomalyPanel(prev => !prev)}
        viewMode={viewMode}
        onSelectView={onSelectView}
      />

      <main style={{ display: 'grid', gridTemplateColumns: '220px 1fr 300px', overflow: 'hidden', position: 'relative' }}>
        <ControlsPanel
          layers={layers} onLayerChange={handleLayerChange}
          variable={variable} onVariableChange={setVariable}
          opacity={opacity} onOpacityChange={setOpacity}
          floats={floats} gliders={gliders} selectedFloatId={selectedFloatId} onJumpToFloat={setSelectedFloatId}
          onExport={handleExport} onRefreshFloats={refreshFloats}
        />

        <div id="scene-host" style={{ position: 'relative', background: 'radial-gradient(ellipse at 50% 20%, #1a5c80 0%, #0c354d 50%, #061e2d 100%)' }}>
          <OceanScene
            variable={variable} depth={depth}
            showField={layers.showField} showCurrents={layers.showCurrents}
            showArgo={layers.showArgo} showGliders={layers.showGliders} showErrGrid={layers.showErrGrid} showBox={layers.showBox}
            showAnomalies={layers.showAnomalies}
            anomalousFloatIds={anomalousFloatIds}
            opacity={opacity}
            bounds={bounds}
            sliceData={sliceData} currentsData={currentsData}
            floats={floats} gliders={gliders} selectedFloatId={selectedFloatId} onSelectFloat={setSelectedFloatId}
            errorByFloat={errorByFloat}
            onSliceRangeChange={setSliceRange}
          />
          <Legend variable={variable} range={sliceRange} depth={depth} bounds={bounds} />
          <div style={overlayStyles.playbadge}>
            Region: <b>{regionLabel}</b> &nbsp;|&nbsp; Model: <b>INCOIS‑GODAS / HYCOM</b> &nbsp;|&nbsp; Obs: <b>Argo floats ({floats?.length ?? '…'})</b> &nbsp;|&nbsp; Gliders: <b>Copernicus NRT ({gliders?.length ?? 0})</b>
          </div>
          <div style={overlayStyles.hint}>Drag to rotate · scroll to zoom · click a marker to inspect profile</div>

          {/* Anomaly Alerts Slide-up Drawer */}
          {showAnomalyPanel && (
            <div style={overlayStyles.drawerOverlay}>
              <AnomalyAlertsPanel
                anomaliesData={anomaliesData}
                anomalyStatus={anomalyStatus}
                onInspectFloat={(id) => {
                  setSelectedFloatId(id);
                }}
                onInjectSynthetic={() => loadAnomalies(true)}
                onRetrainModel={handleRetrainModel}
                onRefreshAnomalies={() => loadAnomalies(false)}
                onClose={() => setShowAnomalyPanel(false)}
              />
            </div>
          )}
        </div>

        <ObservationPanel
          selectedFloatId={selectedFloatId} profile={profile}
          onCompare={handleCompare} compareResult={compareResult}
          fleetStats={fleetStats} onRunFleet={handleRunFleet} floatCount={floats?.length} gliderCount={gliders?.length}
          depth={depth} day={day}
        />
      </main>

      <SliderBar depth={depth} onDepthChange={setDepth} day={day} onDayChange={setDay} nDays={nDays} />
    </div>
  );
}

const overlayStyles = {
  playbadge: {
    position: 'absolute', top: 16, left: 16, background: 'rgba(6,20,31,.85)',
    border: '1px solid var(--line)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: 'var(--mist)',
    zIndex: 5,
  },
  hint: {
    position: 'absolute', bottom: 14, left: 16, fontSize: 11, color: 'var(--mist)',
    background: 'rgba(6,20,31,.7)', padding: '6px 10px', borderRadius: 5,
    zIndex: 5,
  },
  drawerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '420px',
    zIndex: 20,
    boxShadow: '0 -8px 24px rgba(0,0,0,0.6)',
  },
};
