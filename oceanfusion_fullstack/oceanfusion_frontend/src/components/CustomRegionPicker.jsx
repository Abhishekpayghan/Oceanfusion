import { useState, useRef, useEffect } from 'react';

// Domain bounds for the HYCOM dataset
const DOMAIN = {
  latMin: -30,
  latMax: 30,
  lonMin: 30,
  lonMax: 120,
};

// Preset regions for quick 1-click selection
const PRESETS = [
  { name: 'Arabian Sea', latMin: 10, latMax: 24, lonMin: 54, lonMax: 76 },
  { name: 'Bay of Bengal', latMin: 8, latMax: 22, lonMin: 80, lonMax: 98 },
  { name: 'Equatorial IO', latMin: -10, latMax: 10, lonMin: 50, lonMax: 100 },
  { name: 'Mozambique Ch.', latMin: -26, latMax: -12, lonMin: 35, lonMax: 48 },
  { name: 'South IO Basin', latMin: -30, latMax: -10, lonMin: 60, lonMax: 110 },
  { name: 'Full Domain', latMin: -30, latMax: 30, lonMin: 30, lonMax: 120 },
];

function fmtLat(v) {
  if (v === null || isNaN(v)) return '—';
  return `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
}

function fmtLon(v) {
  if (v === null || isNaN(v)) return '—';
  return `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;
}

export default function CustomRegionPicker({ onApply, onCancel }) {
  const [coords, setCoords] = useState({
    latMin: 5,
    latMax: 20,
    lonMin: 75,
    lonMax: 90,
  });

  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState(null);
  const [hoverGeo, setHoverGeo] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const mapRef = useRef(null);

  // Validate coordinates whenever coords change
  useEffect(() => {
    const { latMin, latMax, lonMin, lonMax } = coords;
    if (
      latMin < DOMAIN.latMin || latMax > DOMAIN.latMax ||
      lonMin < DOMAIN.lonMin || lonMax > DOMAIN.lonMax ||
      latMin >= latMax || lonMin >= lonMax
    ) {
      setErrorMsg(
        'Selected region is outside the available HYCOM data domain. Please select an area within: 30°S–30°N and 30°E–120°E.'
      );
    } else {
      setErrorMsg('');
    }
  }, [coords]);

  const pixelToGeo = (px, py, width, height) => {
    // Map X pixel -> Longitude (30E to 120E)
    // Map Y pixel -> Latitude (30N to 30S)
    const lon = DOMAIN.lonMin + (px / width) * (DOMAIN.lonMax - DOMAIN.lonMin);
    const lat = DOMAIN.latMax - (py / height) * (DOMAIN.latMax - DOMAIN.latMin);
    return {
      lat: Math.round(lat * 10) / 10,
      lon: Math.round(lon * 10) / 10,
    };
  };

  const handleMouseDown = (e) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const pt = pixelToGeo(px, py, rect.width, rect.height);
    setStartPoint(pt);
    setIsDrawing(true);
    setCoords({
      latMin: pt.lat,
      latMax: pt.lat,
      lonMin: pt.lon,
      lonMax: pt.lon,
    });
  };

  const handleMouseMove = (e) => {
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const py = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const pt = pixelToGeo(px, py, rect.width, rect.height);

    setHoverGeo({ lat: pt.lat, lon: pt.lon, px, py });

    if (isDrawing && startPoint) {
      setCoords({
        latMin: Math.min(startPoint.lat, pt.lat),
        latMax: Math.max(startPoint.lat, pt.lat),
        lonMin: Math.min(startPoint.lon, pt.lon),
        lonMax: Math.max(startPoint.lon, pt.lon),
      });
    }
  };

  const handleMouseLeave = () => {
    setHoverGeo(null);
    if (isDrawing) {
      setIsDrawing(false);
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const handleApply = () => {
    if (errorMsg) return;
    const key = `custom_${coords.latMin}_${coords.latMax}_${coords.lonMin}_${coords.lonMax}`;
    onApply(key, coords);
  };

  const handleClear = () => {
    setCoords({ latMin: 5, latMax: 20, lonMin: 75, lonMax: 90 });
  };

  const handlePresetSelect = (preset) => {
    setCoords({
      latMin: preset.latMin,
      latMax: preset.latMax,
      lonMin: preset.lonMin,
      lonMax: preset.lonMax,
    });
  };

  // Convert coords to percentage position for visual rectangle overlay
  const getBoxPixels = () => {
    const left = ((coords.lonMin - DOMAIN.lonMin) / (DOMAIN.lonMax - DOMAIN.lonMin)) * 100;
    const right = ((coords.lonMax - DOMAIN.lonMin) / (DOMAIN.lonMax - DOMAIN.lonMin)) * 100;
    const top = ((DOMAIN.latMax - coords.latMax) / (DOMAIN.latMax - DOMAIN.latMin)) * 100;
    const bottom = ((DOMAIN.latMax - coords.latMin) / (DOMAIN.latMax - DOMAIN.latMin)) * 100;

    return {
      left: `${Math.max(0, left)}%`,
      top: `${Math.max(0, top)}%`,
      width: `${Math.min(100 - left, Math.max(0.5, right - left))}%`,
      height: `${Math.min(100 - top, Math.max(0.5, bottom - top))}%`,
    };
  };

  const boxStyle = getBoxPixels();

  // Calculate approximate coverage area span
  const latSpan = Math.abs(coords.latMax - coords.latMin);
  const lonSpan = Math.abs(coords.lonMax - coords.lonMin);

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modalContent}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Custom Indian Ocean Region Selection</h2>
            <div style={styles.subtitle}>INCOIS HYCOM Model Domain (30°S–30°N, 30°E–120°E)</div>
          </div>
          <button style={styles.closeBtn} onClick={onCancel}>✕</button>
        </div>

        <p style={styles.desc}>
          Click & drag on the Indian Ocean map to define a bounding box, choose a regional preset, or enter exact latitude/longitude coordinates below.
        </p>

        {/* Quick Presets Bar */}
        <div style={styles.presetsBar}>
          <span style={styles.presetLabel}>Quick Presets:</span>
          <div style={styles.presetChips}>
            {PRESETS.map((p) => {
              const isActive =
                coords.latMin === p.latMin &&
                coords.latMax === p.latMax &&
                coords.lonMin === p.lonMin &&
                coords.lonMax === p.lonMax;
              return (
                <button
                  key={p.name}
                  style={{
                    ...styles.chip,
                    ...(isActive ? styles.activeChip : {}),
                  }}
                  onClick={() => handlePresetSelect(p)}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {errorMsg && <div style={styles.errorBox}>{errorMsg}</div>}

        <div style={styles.bodyGrid}>
          {/* Interactive Indian Ocean Map Area */}
          <div
            ref={mapRef}
            style={styles.mapCanvas}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          >
            {/* Indian Ocean SVG Vector Map */}
            <svg
              viewBox="0 0 900 600"
              style={styles.svgMap}
              preserveAspectRatio="none"
            >
              <defs>
                {/* Ocean Gradient */}
                <radialGradient id="oceanBg" cx="50%" cy="40%" r="70%">
                  <stop offset="0%" stopColor="#0d3c59" />
                  <stop offset="55%" stopColor="#041f33" />
                  <stop offset="100%" stopColor="#020d18" />
                </radialGradient>
                {/* Land Mass Fill & Glow */}
                <linearGradient id="landGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1e3b2e" />
                  <stop offset="100%" stopColor="#0e241b" />
                </linearGradient>
                <filter id="landGlow" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#20d3c2" floodOpacity="0.3" />
                </filter>
              </defs>

              {/* Ocean Background */}
              <rect width="900" height="600" fill="url(#oceanBg)" />

              {/* Bathymetry Contours / Depth Accents */}
              <path
                d="M 150 170 Q 250 200 450 220 T 700 240 Q 800 350 850 500"
                fill="none"
                stroke="rgba(63, 182, 255, 0.08)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <path
                d="M 0 300 Q 300 320 500 350 T 900 450"
                fill="none"
                stroke="rgba(63, 182, 255, 0.06)"
                strokeWidth="2"
              />
              <path
                d="M 400 0 C 420 150 480 300 500 600"
                fill="none"
                stroke="rgba(32, 211, 194, 0.07)"
                strokeWidth="1.5"
              />

              {/* Latitude & Longitude Graticule Lines */}
              {/* Latitude Lines */}
              {/* 30°N (Y=0) */}
              <line x1="0" y1="0" x2="900" y2="0" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              {/* 15°N (Y=150) */}
              <line x1="0" y1="150" x2="900" y2="150" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              {/* Equator 0° (Y=300) */}
              <line x1="0" y1="300" x2="900" y2="300" stroke="rgba(32, 211, 194, 0.3)" strokeWidth="1.2" strokeDasharray="6 3" />
              {/* 15°S (Y=450) */}
              <line x1="0" y1="450" x2="900" y2="450" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              {/* 30°S (Y=600) */}
              <line x1="0" y1="600" x2="900" y2="600" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

              {/* Longitude Lines */}
              {/* 30°E (X=0) */}
              <line x1="0" y1="0" x2="0" y2="600" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              {/* 45°E (X=150) */}
              <line x1="150" y1="0" x2="150" y2="600" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              {/* 60°E (X=300) */}
              <line x1="300" y1="0" x2="300" y2="600" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              {/* 75°E (X=450) */}
              <line x1="450" y1="0" x2="450" y2="600" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              {/* 90°E (X=600) */}
              <line x1="600" y1="0" x2="600" y2="600" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              {/* 105°E (X=750) */}
              <line x1="750" y1="0" x2="750" y2="600" stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              {/* 120°E (X=900) */}
              <line x1="900" y1="0" x2="900" y2="600" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

              {/* Vector Landmasses */}
              <g fill="url(#landGrad)" stroke="#2b5e46" strokeWidth="1.2" filter="url(#landGlow)">
                {/* 1. Indian Subcontinent & South Asia */}
                <path d="
                  M 380 0
                  L 380 60
                  Q 385 62 400 70
                  Q 390 90 392 95
                  L 410 93
                  L 422 78
                  L 428 110
                  L 438 146
                  L 448 171
                  L 462 201
                  L 475 219
                  L 493 207
                  L 499 197
                  L 503 169
                  L 533 123
                  L 558 102
                  L 585 84
                  L 615 76
                  L 625 92
                  L 635 110
                  L 655 140
                  L 680 160
                  L 680 0
                  Z
                " />

                {/* Sri Lanka */}
                <path d="
                  M 498 215
                  Q 512 210 516 223
                  Q 514 238 506 241
                  Q 494 235 498 215
                  Z
                " />

                {/* 2. Arabian Peninsula & Middle East */}
                <path d="
                  M 50 0
                  L 92 85
                  L 134 174
                  L 150 172
                  L 190 155
                  L 240 130
                  L 298 75
                  L 285 64
                  L 265 35
                  L 180 0
                  Z
                " />

                {/* Socotra Island */}
                <circle cx="238" cy="175" r="4" />

                {/* 3. East Africa & Madagascar */}
                <path d="
                  M 0 0
                  L 50 0
                  L 134 174
                  L 213 196
                  Q 180 240 153 280
                  L 125 304
                  L 96 340
                  L 93 368
                  L 102 403
                  L 105 430
                  L 48 498
                  L 26 560
                  L 0 600
                  Z
                " />

                {/* Madagascar */}
                <path d="
                  M 192 420
                  Q 208 450 205 470
                  L 194 482
                  L 152 556
                  L 137 533
                  L 163 457
                  Z
                " />

                {/* Comoros */}
                <circle cx="133" cy="417" r="3" />
                <circle cx="144" cy="422" r="3" />

                {/* Seychelles */}
                <circle cx="254" cy="346" r="3" />

                {/* Mauritius & Reunion */}
                <circle cx="275" cy="503" r="3" />
                <circle cx="255" cy="511" r="3" />

                {/* Chagos / Diego Garcia */}
                <circle cx="424" cy="373" r="3" />

                {/* Maldives Archipelago Chain */}
                <path d="
                  M 432 230 L 434 245 L 433 260 L 432 275 L 433 290 L 431 306
                " stroke="#20d3c2" strokeWidth="2.5" strokeLinecap="round" />

                {/* Lakshadweep Islands */}
                <circle cx="425" cy="190" r="2.5" />
                <circle cx="428" cy="205" r="2.5" />

                {/* Andaman & Nicobar Islands Chain */}
                <path d="
                  M 628 165 L 632 185 L 635 205 L 638 225 L 639 235
                " stroke="#20d3c2" strokeWidth="2.5" strokeLinecap="round" />

                {/* 4. Southeast Asia (Malay Peninsula, Sumatra, Java, Lesser Sunda) */}
                {/* Malay Peninsula */}
                <path d="
                  M 680 160
                  L 685 200
                  L 684 221
                  L 703 246
                  L 738 287
                  L 750 280
                  L 710 210
                  L 690 160
                  Z
                " />

                {/* Sumatra */}
                <path d="
                  M 653 245
                  L 687 264
                  L 703 309
                  L 723 338
                  L 758 359
                  L 745 368
                  L 710 330
                  L 680 290
                  Z
                " />

                {/* Java */}
                <path d="
                  M 759 360
                  L 768 361
                  L 827 372
                  L 844 382
                  L 830 388
                  L 785 377
                  L 755 366
                  Z
                " />

                {/* Lesser Sunda Islands (Bali to Timor) */}
                <rect x="850" y="382" width="8" height="4" rx="2" />
                <rect x="862" y="384" width="10" height="4" rx="2" />
                <rect x="878" y="384" width="14" height="5" rx="2" />
                <rect x="895" y="384" width="18" height="5" rx="2" />

                {/* 5. Northwest Australia */}
                <path d="
                  M 900 464
                  L 886 503
                  L 867 507
                  L 841 518
                  L 831 561
                  L 846 588
                  L 855 600
                  L 900 600
                  Z
                " />
              </g>

              {/* Sea & Ocean Basin Text Labels */}
              <g fontSize="11" fontFamily="sans-serif" fontWeight="600" fill="rgba(63, 182, 255, 0.45)" letterSpacing="1">
                <text x="350" y="110" textAnchor="middle">ARABIAN SEA</text>
                <text x="560" y="140" textAnchor="middle">BAY OF BENGAL</text>
                <text x="700" y="200" textAnchor="middle" fontSize="9">ANDAMAN SEA</text>
                <text x="140" y="460" textAnchor="middle" fontSize="9.5" transform="rotate(-40, 140, 460)">MOZAMBIQUE CHANNEL</text>
                <text x="450" y="325" textAnchor="middle" fill="rgba(32, 211, 194, 0.55)" fontSize="12" letterSpacing="2">EQUATORIAL INDIAN OCEAN</text>
                <text x="450" y="490" textAnchor="middle" fontSize="11" letterSpacing="1.5">SOUTH INDIAN OCEAN BASIN</text>
              </g>

              {/* Geographic Label Badges for Landmasses */}
              <g fontSize="9.5" fontFamily="sans-serif" fill="rgba(255, 255, 255, 0.4)" fontWeight="500">
                <text x="455" y="100">INDIA</text>
                <text x="525" y="235">SRI LANKA</text>
                <text x="170" y="55">ARABIA</text>
                <text x="60" y="320">AFRICA</text>
                <text x="180" y="500">MADAGASCAR</text>
                <text x="690" y="320">SUMATRA</text>
                <text x="860" y="540">AUSTRALIA</text>
              </g>
            </svg>

            {/* Grid Line Coordinates Overlay Badges */}
            <div style={styles.mapGridLines}>
              {/* Latitude Badges */}
              <div style={{ ...styles.gridLabel, top: 4, left: 8 }}>30°N</div>
              <div style={{ ...styles.gridLabel, top: '24%', left: 8 }}>15°N</div>
              <div style={{ ...styles.gridLabel, top: '48%', left: 8, color: 'var(--current)', fontWeight: 'bold' }}>0° (Equator)</div>
              <div style={{ ...styles.gridLabel, top: '73%', left: 8 }}>15°S</div>
              <div style={{ ...styles.gridLabel, bottom: 4, left: 8 }}>30°S</div>

              {/* Longitude Badges */}
              <div style={{ ...styles.gridLabel, bottom: 4, left: '2%' }}>30°E</div>
              <div style={{ ...styles.gridLabel, bottom: 4, left: '16%' }}>45°E</div>
              <div style={{ ...styles.gridLabel, bottom: 4, left: '32%' }}>60°E</div>
              <div style={{ ...styles.gridLabel, bottom: 4, left: '49%' }}>75°E</div>
              <div style={{ ...styles.gridLabel, bottom: 4, left: '65%' }}>90°E</div>
              <div style={{ ...styles.gridLabel, bottom: 4, left: '82%' }}>105°E</div>
              <div style={{ ...styles.gridLabel, bottom: 4, right: '2%' }}>120°E</div>
            </div>

            {/* Live Hover Crosshair & Coordinate Indicator */}
            {hoverGeo && !isDrawing && (
              <>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: hoverGeo.px,
                    width: 1,
                    background: 'rgba(32, 211, 194, 0.35)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: hoverGeo.py,
                    height: 1,
                    background: 'rgba(32, 211, 194, 0.35)',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: Math.min(hoverGeo.px + 12, mapRef.current?.clientWidth - 110 || hoverGeo.px),
                    top: Math.max(hoverGeo.py - 24, 8),
                    background: 'rgba(4, 25, 41, 0.9)',
                    border: '1px solid var(--current)',
                    color: 'var(--foam)',
                    fontSize: 10,
                    fontFamily: 'var(--mono)',
                    padding: '2px 6px',
                    borderRadius: 4,
                    pointerEvents: 'none',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}
                >
                  {fmtLat(hoverGeo.lat)}, {fmtLon(hoverGeo.lon)}
                </div>
              </>
            )}

            {/* Drawn Bounding Box Highlight Overlay */}
            {coords.latMin < coords.latMax && coords.lonMin < coords.lonMax && (
              <div
                style={{
                  ...styles.selectionBox,
                  left: boxStyle.left,
                  top: boxStyle.top,
                  width: boxStyle.width,
                  height: boxStyle.height,
                }}
              >
                {/* Corner Handles for visually rich UX */}
                <div style={{ ...styles.boxHandle, top: -4, left: -4 }} />
                <div style={{ ...styles.boxHandle, top: -4, right: -4 }} />
                <div style={{ ...styles.boxHandle, bottom: -4, left: -4 }} />
                <div style={{ ...styles.boxHandle, bottom: -4, right: -4 }} />

                {/* Top Badge showing Lat/Lon span */}
                <span style={styles.boxLabel}>
                  {fmtLat(coords.latMin)}–{fmtLat(coords.latMax)}, {fmtLon(coords.lonMin)}–{fmtLon(coords.lonMax)}
                </span>

                {/* Center Badge showing geographic area span */}
                <div style={styles.boxCenterTag}>
                  {latSpan.toFixed(1)}° Lat × {lonSpan.toFixed(1)}° Lon
                </div>
              </div>
            )}
          </div>

          {/* Coordinates Fine-Tuning Panel */}
          <div style={styles.panel}>
            <div style={styles.panelTitle}>BOUNDING BOX COORDINATES</div>

            <div style={styles.fieldGroup}>
              <div style={styles.fieldLabel}>Latitude Range:</div>
              <div style={styles.coordRangeText}>
                {fmtLat(coords.latMin)} → {fmtLat(coords.latMax)}
              </div>
              <div style={styles.inputsRow}>
                <div>
                  <span style={styles.subLbl}>Min (°N/S)</span>
                  <input
                    type="number"
                    step="0.5"
                    min={DOMAIN.latMin}
                    max={coords.latMax - 0.5}
                    value={coords.latMin}
                    onChange={(e) => setCoords((prev) => ({ ...prev, latMin: Number(e.target.value) }))}
                    style={styles.numInput}
                  />
                </div>
                <div>
                  <span style={styles.subLbl}>Max (°N/S)</span>
                  <input
                    type="number"
                    step="0.5"
                    min={coords.latMin + 0.5}
                    max={DOMAIN.latMax}
                    value={coords.latMax}
                    onChange={(e) => setCoords((prev) => ({ ...prev, latMax: Number(e.target.value) }))}
                    style={styles.numInput}
                  />
                </div>
              </div>
            </div>

            <div style={styles.fieldGroup}>
              <div style={styles.fieldLabel}>Longitude Range:</div>
              <div style={styles.coordRangeText}>
                {fmtLon(coords.lonMin)} → {fmtLon(coords.lonMax)}
              </div>
              <div style={styles.inputsRow}>
                <div>
                  <span style={styles.subLbl}>Min (°E)</span>
                  <input
                    type="number"
                    step="0.5"
                    min={DOMAIN.lonMin}
                    max={coords.lonMax - 0.5}
                    value={coords.lonMin}
                    onChange={(e) => setCoords((prev) => ({ ...prev, lonMin: Number(e.target.value) }))}
                    style={styles.numInput}
                  />
                </div>
                <div>
                  <span style={styles.subLbl}>Max (°E)</span>
                  <input
                    type="number"
                    step="0.5"
                    min={coords.lonMin + 0.5}
                    max={DOMAIN.lonMax}
                    value={coords.lonMax}
                    onChange={(e) => setCoords((prev) => ({ ...prev, lonMax: Number(e.target.value) }))}
                    style={styles.numInput}
                  />
                </div>
              </div>
            </div>

            {/* Region Summary Card */}
            <div style={styles.summaryBox}>
              <div style={styles.summaryRow}>
                <span>Selected Area:</span>
                <span style={{ color: 'var(--foam)', fontWeight: 600 }}>
                  {(latSpan * 111 * (lonSpan * 111 * Math.cos(((coords.latMin + coords.latMax) / 2 * Math.PI) / 180))).toLocaleString(undefined, { maximumFractionDigits: 0 })} km²
                </span>
              </div>
              <div style={styles.summaryRow}>
                <span>Grid Resolution:</span>
                <span style={{ color: 'var(--current)' }}>HYCOM ~1/12° (8 km)</span>
              </div>
            </div>

            <div style={styles.btnRow}>
              <button
                style={{
                  ...styles.applyBtn,
                  opacity: errorMsg ? 0.5 : 1,
                  cursor: errorMsg ? 'not-allowed' : 'pointer',
                }}
                disabled={!!errorMsg}
                onClick={handleApply}
              >
                Apply Region →
              </button>
              <button style={styles.clearBtn} onClick={handleClear}>Reset</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2, 10, 18, 0.88)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 20,
  },
  modalContent: {
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 14,
    maxWidth: 960,
    width: '100%',
    padding: 24,
    color: 'var(--foam)',
    boxShadow: '0 25px 50px rgba(0,0,0,0.7)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  title: { fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--foam)' },
  subtitle: { fontSize: 11.5, color: 'var(--current)', fontFamily: 'var(--mono)', marginTop: 2 },
  closeBtn: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    color: 'var(--mist)',
    fontSize: 16,
    cursor: 'pointer',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  desc: { fontSize: 13, color: 'var(--mist)', margin: '6px 0 14px', lineHeight: 1.5 },
  presetsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    background: 'rgba(4, 25, 41, 0.6)',
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--line)',
  },
  presetLabel: { fontSize: 11.5, color: 'var(--mist)', fontWeight: 600, whiteSpace: 'nowrap' },
  presetChips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    background: 'var(--deep)',
    border: '1px solid var(--line)',
    color: 'var(--foam)',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 11,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontWeight: 500,
  },
  activeChip: {
    background: 'rgba(32, 211, 194, 0.18)',
    borderColor: 'var(--current)',
    color: 'var(--current)',
    fontWeight: 700,
    boxShadow: '0 0 8px rgba(32, 211, 194, 0.3)',
  },
  errorBox: {
    background: 'rgba(255, 93, 108, 0.12)',
    border: '1px solid var(--error)',
    color: '#ffd7db',
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 12.5,
    marginBottom: 16,
  },
  bodyGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 300px',
    gap: 20,
    alignItems: 'start',
  },
  mapCanvas: {
    position: 'relative',
    height: 380,
    background: '#020d18',
    border: '1px solid var(--line)',
    borderRadius: 10,
    cursor: 'crosshair',
    userSelect: 'none',
    overflow: 'hidden',
    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
  },
  svgMap: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  mapGridLines: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  },
  gridLabel: {
    position: 'absolute',
    fontSize: 9.5,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'var(--mono)',
    pointerEvents: 'none',
    textShadow: '0 1px 3px rgba(0,0,0,0.8)',
  },
  selectionBox: {
    position: 'absolute',
    border: '2px solid var(--current)',
    background: 'rgba(32, 211, 194, 0.22)',
    borderRadius: 4,
    boxShadow: '0 0 16px rgba(32, 211, 194, 0.45)',
    pointerEvents: 'none',
    transition: 'all 0.05s ease-out',
  },
  boxHandle: {
    position: 'absolute',
    width: 7,
    height: 7,
    background: 'var(--current)',
    border: '1px solid #020e17',
    borderRadius: 1,
  },
  boxLabel: {
    position: 'absolute',
    top: -24,
    left: 0,
    background: 'var(--current)',
    color: '#020e17',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    fontFamily: 'var(--mono)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
  },
  boxCenterTag: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(4, 25, 41, 0.85)',
    border: '1px solid rgba(32, 211, 194, 0.4)',
    color: 'var(--foam)',
    fontSize: 9.5,
    fontWeight: 600,
    fontFamily: 'var(--mono)',
    padding: '2px 6px',
    borderRadius: 3,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  },
  panel: {
    background: 'var(--deep)',
    border: '1px solid var(--line)',
    borderRadius: 10,
    padding: 18,
  },
  panelTitle: {
    fontSize: 11.5,
    fontWeight: 700,
    color: 'var(--current)',
    letterSpacing: 0.8,
    marginBottom: 14,
    borderBottom: '1px solid var(--line)',
    paddingBottom: 6,
  },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 11, color: 'var(--mist)', marginBottom: 2 },
  coordRangeText: { fontSize: 14, fontWeight: 600, color: 'var(--foam)', fontFamily: 'var(--mono)', marginBottom: 8 },
  inputsRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  subLbl: { display: 'block', fontSize: 10, color: 'var(--mist)', marginBottom: 3 },
  numInput: {
    width: '100%',
    background: 'var(--panel)',
    border: '1px solid var(--line)',
    borderRadius: 5,
    color: 'var(--foam)',
    padding: '5px 8px',
    fontSize: 12,
    fontFamily: 'var(--mono)',
    outline: 'none',
  },
  summaryBox: {
    background: 'rgba(4, 25, 41, 0.5)',
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: '10px 12px',
    marginTop: 14,
  },
  summaryRow: {
    display: 'flex',
    justify: 'space-between',
    fontSize: 11,
    color: 'var(--mist)',
    marginBottom: 4,
  },
  btnRow: { display: 'flex', gap: 10, marginTop: 18 },
  applyBtn: {
    flex: 1,
    background: 'var(--current)',
    color: '#020e17',
    border: 'none',
    borderRadius: 6,
    fontWeight: 700,
    padding: '9px 12px',
    fontSize: 13,
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(32, 211, 194, 0.3)',
  },
  clearBtn: {
    background: 'none',
    border: '1px solid var(--line)',
    color: 'var(--mist)',
    borderRadius: 6,
    padding: '9px 12px',
    fontSize: 12,
    cursor: 'pointer',
  },
};
