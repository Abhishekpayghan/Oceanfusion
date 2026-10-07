import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Fallback bounding box used only until the region's real bounds arrive
// from the backend (see Dashboard's `bounds`, derived from /api/metadata).
const DEFAULT_BOUNDS = { latMin: -5, latMax: 25, lonMin: 50, lonMax: 95, depthMax: 1000 };
const DEPTH_LEVELS = [0, 50, 100, 200, 300, 500, 700, 1000];
const SLICE_RES = 64;

function lerp(a, b, t) { return a + (b - a) * t; }
function tempColor(t) {
  const stops = [[0.0, [8, 28, 92]], [0.28, [10, 110, 170]], [0.55, [40, 190, 150]], [0.78, [240, 190, 60]], [1.0, [230, 60, 50]]];
  let x = (t - 2) / (32 - 2); x = Math.min(1, Math.max(0, x));
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) {
      const tt = (x - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const c0 = stops[i][1], c1 = stops[i + 1][1];
      return [Math.round(lerp(c0[0], c1[0], tt)), Math.round(lerp(c0[1], c1[1], tt)), Math.round(lerp(c0[2], c1[2], tt))];
    }
  }
  return [230, 60, 50];
}
function salColor(s) {
  const stops = [[0.0, [20, 40, 110]], [0.5, [40, 140, 180]], [1.0, [210, 235, 235]]];
  let x = (s - 34.0) / (36.2 - 34.0); x = Math.min(1, Math.max(0, x));
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) {
      const tt = (x - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const c0 = stops[i][1], c1 = stops[i + 1][1];
      return [Math.round(lerp(c0[0], c1[0], tt)), Math.round(lerp(c0[1], c1[1], tt)), Math.round(lerp(c0[2], c1[2], tt))];
    }
  }
  return [210, 235, 235];
}
function currentsColor(s) {
  const stops = [[0.0, [10, 30, 80]], [0.25, [20, 140, 190]], [0.5, [40, 200, 160]], [0.75, [240, 210, 60]], [1.0, [235, 70, 50]]];
  let x = s / 1.5; x = Math.min(1, Math.max(0, x));
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) {
      const tt = (x - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const c0 = stops[i][1], c1 = stops[i + 1][1];
      return [Math.round(lerp(c0[0], c1[0], tt)), Math.round(lerp(c0[1], c1[1], tt)), Math.round(lerp(c0[2], c1[2], tt))];
    }
  }
  return [235, 70, 50];
}
function valueColor(varName, v) {
  if (varName === 'temp') return tempColor(v);
  if (varName === 'sal') return salColor(v);
  return currentsColor(v);
}
function errColor(err) {
  const m = Math.max(-3, Math.min(3, err));
  if (m < 0) { const t = (m + 3) / 3; return [Math.round(lerp(60, 255, t)), Math.round(lerp(90, 255, t)), Math.round(lerp(230, 255, t))]; }
  const t = m / 3; return [Math.round(lerp(255, 230, t)), Math.round(lerp(255, 60, t)), Math.round(lerp(255, 50, t))];
}

function createTextLabelSprite(text, options = {}) {
  // Ultra-high resolution canvas for crisp, large text rendering in 3D
  const canvas = document.createElement('canvas');
  canvas.width = options.isTitle ? 640 : options.isBadge ? 540 : 400;
  canvas.height = 120;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isHigh = options.isHighlighted || options.isBadge;
  const isTitle = options.isTitle;

  const textColor = options.color || (isHigh ? '#ffe052' : '#ffffff');
  const bgColor = options.bgColor || (isHigh ? 'rgba(6, 22, 36, 0.98)' : 'rgba(3, 16, 28, 0.96)');
  const borderColor = options.borderColor || (isHigh ? '#ffe052' : '#00f0ff');

  // Solid dark backdrop pill with thick border
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = isHigh || isTitle ? 5 : 4;

  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 18);
  } else {
    ctx.rect(8, 8, canvas.width - 16, canvas.height - 16);
  }
  ctx.fill();
  ctx.stroke();

  // Bold large typography
  const fontSize = isTitle ? 42 : isHigh ? 48 : 52;
  ctx.font = `900 ${fontSize}px "JetBrains Mono", "Segoe UI", system-ui, sans-serif`;

  // Dark text stroke outline for extra pop & contrast
  ctx.strokeStyle = '#010810';
  ctx.lineWidth = 8;
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2 + 3);

  // Bright text fill with glow
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = isHigh ? 16 : 8;

  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 3);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 999; // Ensure text always renders on top of 3D geometry

  // Scale in 3D world units (noticeably bigger & prominent)
  const scaleW = isTitle ? 85 : isHigh ? 72 : 52;
  const scaleH = isTitle ? 16.0 : isHigh ? 16.0 : 15.6;
  sprite.scale.set(scaleW, scaleH, 1);

  return sprite;
}




/**
 * Props:
 *  variable, showField, showCurrents, showArgo, showErrGrid, showBox, opacity
 *  sliceData: {lats, lons, values, vmin, vmax} | null   (from /api/model/slice)
 *  currentsData: {lats, lons, u, v} | null               (from /api/model/currents)
 *  floats: [{id, lat, lon}]                              (from /api/argo)
 *  selectedFloatId, onSelectFloat(id)
 *  errorByFloat: {[id]: signedError} | null              (from /api/analytics/fleet, for error map colouring)
 *  depth: number                                          (only used to position the slice plane)
 *  onSliceRangeChange({min,max})                          (lets the legend read the rendered range)
 *  bounds: {latMin,latMax,lonMin,lonMax,depthMax} | null  (the selected region's box; see Dashboard)
 */
export default function OceanScene({
  variable, showField, showCurrents, showArgo, showGliders = true, showErrGrid, showBox, opacity,
  sliceData, currentsData, floats, gliders = [], selectedFloatId, onSelectFloat, errorByFloat,
  depth, onSliceRangeChange, bounds,
  anomalousFloatIds = [], showAnomalies = false,
}) {
  const hostRef = useRef(null);
  const three = useRef({}); // holds every mutable three.js object across renders

  const b = bounds || DEFAULT_BOUNDS;
  const spanLon = b ? (b.lonMax - b.lonMin) : 45;
  const spanLat = b ? (b.latMax - b.latMin) : 30;

  // Auto-size 3D volume cube dimensions proportional to selected region bounds
  const BOX_W = Math.min(850, Math.max(580, Math.round(spanLon * 18)));
  const BOX_D = Math.min(720, Math.max(480, Math.round(spanLat * 20)));
  const BOX_H = 420;

  // Strict spatial coordinate transformers -- clamps all markers inside 3D volume box
  const lonToX = (lon) => {
    const rawX = (lon - b.lonMin) / (b.lonMax - b.lonMin) * BOX_W - BOX_W / 2;
    return Math.max(-BOX_W / 2 + 22, Math.min(BOX_W / 2 - 22, rawX));
  };

  const latToZ = (lat) => {
    const rawZ = (lat - b.latMin) / (b.latMax - b.latMin) * BOX_D - BOX_D / 2;
    return Math.max(-BOX_D / 2 + 22, Math.min(BOX_D / 2 - 22, rawZ));
  };

  const depthToY = (depthVal) => {
    const rawY = -(depthVal / b.depthMax) * BOX_H;
    return Math.max(-BOX_H + 15, Math.min(10, rawY));
  };

  // ---- one-time scene setup ----
  useEffect(() => {
    const host = hostRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const dl1 = new THREE.DirectionalLight(0xffffff, 1.2); dl1.position.set(250, 400, 200); scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0x60d0ff, 0.7); dl2.position.set(-200, 150, -150); scene.add(dl2);
    scene.add(new THREE.HemisphereLight(0xedf8ff, 0x0b3248, 0.9));

    // domain wireframe
    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D));
    const boxLines = new THREE.LineSegments(boxEdges, new THREE.LineBasicMaterial({ color: 0x41a8d8, transparent: true, opacity: 0.75 }));
    boxLines.position.y = -BOX_H / 2;
    scene.add(boxLines);

    // depth-tinted translucent water body
    const waterGeo = new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D);
    {
      const posAttr = waterGeo.attributes.position;
      const topColor = new THREE.Color(0x5ee3ff), botColor = new THREE.Color(0x0a3d62);
      const colors = [];
      for (let i = 0; i < posAttr.count; i++) {
        const t = (posAttr.getY(i) + BOX_H / 2) / BOX_H;
        const c = topColor.clone().lerp(botColor, 1 - t);
        colors.push(c.r, c.g, c.b);
      }
      waterGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }
    const waterMat = new THREE.MeshPhongMaterial({
      vertexColors: true, transparent: true, opacity: 0.18, side: THREE.DoubleSide,
      shininess: 80, specular: 0x7be4ff, depthWrite: false,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.y = -BOX_H / 2;
    scene.add(waterMesh);

    // animated wavy sea surface
    const seaGeo = new THREE.PlaneGeometry(BOX_W * 1.08, BOX_D * 1.08, 36, 36);
    const seaMat = new THREE.MeshPhongMaterial({
      color: 0x38d8f5, transparent: true, opacity: 0.45, side: THREE.DoubleSide,
      shininess: 160, specular: 0xffffff, depthWrite: false,
    });
    const seaMesh = new THREE.Mesh(seaGeo, seaMat);
    seaMesh.rotation.x = -Math.PI / 2;
    seaMesh.position.y = 7;
    scene.add(seaMesh);
    const seaBase = seaGeo.attributes.position.array.slice();

    // undulating seafloor
    const floorGeo = new THREE.PlaneGeometry(BOX_W * 1.05, BOX_D * 1.05, 28, 28);
    {
      const p = floorGeo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        p.setZ(i, Math.sin(x * 0.05) * 3 + Math.cos(y * 0.045) * 2.6 + Math.sin(x * 0.14 + y * 0.11) * 1.3);
      }
      floorGeo.computeVertexNormals();
    }
    const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshPhongMaterial({ color: 0x1d4d5e, shininess: 20, specular: 0x3fb6ff }));
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -BOX_H - 3;
    scene.add(floorMesh);

    scene.fog = new THREE.FogExp2(0x0a2e45, 0.0004);


    // scalar data slice
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = SLICE_RES; sliceCanvas.height = SLICE_RES;
    const sliceCtx = sliceCanvas.getContext('2d');
    const sliceTex = new THREE.CanvasTexture(sliceCanvas);
    sliceTex.magFilter = THREE.LinearFilter; sliceTex.minFilter = THREE.LinearFilter;
    const sliceMat = new THREE.MeshBasicMaterial({ map: sliceTex, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const sliceMesh = new THREE.Mesh(new THREE.PlaneGeometry(BOX_W, BOX_D), sliceMat);
    sliceMesh.rotation.x = -Math.PI / 2;
    scene.add(sliceMesh);

    // currents group (rebuilt on demand)
    const currentGroup = new THREE.Group();
    scene.add(currentGroup);

    // float markers group
    const floatGroup = new THREE.Group();
    scene.add(floatGroup);

    // corner depth range ruler group
    const depthRulerGroup = new THREE.Group();
    scene.add(depthRulerGroup);

    // camera + controls
    camera.position.set(360, 260, 460);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -BOX_H / 2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 180;
    controls.maxDistance = 1400;
    controls.update();

    // raycasting
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2();
    function handleClick(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObjects(floatGroup.children, true);
      if (hits.length) {
        let obj = hits[0].object;
        while (obj && !obj.userData?.floatId && obj.parent) {
          obj = obj.parent;
        }
        if (obj && obj.userData?.floatId) {
          three.current.onSelectFloat?.(obj.userData.floatId);
        }
      }
    }
    renderer.domElement.addEventListener('click', handleClick);

    function resize() {
      const w = host.clientWidth, h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    let raf;
    function animate() {
      raf = requestAnimationFrame(animate);
      const t = performance.now() * 0.0006;
      const posAttr = seaGeo.attributes.position;
      const arr = posAttr.array;
      for (let i = 0; i < posAttr.count; i++) {
        const ix = i * 3;
        arr[ix + 2] = Math.sin(seaBase[ix] * 0.045 + t * 1.7) * 3.2 + Math.cos(seaBase[ix + 1] * 0.05 + t * 1.2) * 2.4;
      }
      posAttr.needsUpdate = true;
      seaGeo.computeVertexNormals();
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    three.current = {
      ...three.current, scene, camera, renderer, controls, boxLines, sliceMesh, sliceMat,
      sliceCtx, sliceCanvas, sliceTex, currentGroup, floatGroup, depthRulerGroup, waterMesh, seaMesh, floorMesh,
    };

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', handleClick);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the click handler's closure fresh without re-running scene setup
  useEffect(() => { three.current.onSelectFloat = onSelectFloat; }, [onSelectFloat]);

  // ---- layer visibility toggles ----
  useEffect(() => {
    const t = three.current;
    if (!t.boxLines) return;
    t.boxLines.visible = showBox;
    t.sliceMesh.visible = showField;
    if (t.depthRulerGroup) t.depthRulerGroup.visible = showBox;
  }, [showBox, showField]);

  useEffect(() => {
    if (three.current.sliceMat) three.current.sliceMat.opacity = opacity;
  }, [opacity]);

  // ---- render the 3D corner depth range line & scale ruler ----
  useEffect(() => {
    const t = three.current;
    if (!t.depthRulerGroup) return;
    t.depthRulerGroup.clear();
    if (!showBox) return;

    const cornerX = -BOX_W / 2 - 3;
    const cornerZ = BOX_D / 2 + 3;

    // 1. Main vertical corner depth range axis line
    const mainLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cornerX, 0, cornerZ),
      new THREE.Vector3(cornerX, -BOX_H, cornerZ),
    ]);
    const mainLineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
    });
    const mainLine = new THREE.Line(mainLineGeo, mainLineMat);
    t.depthRulerGroup.add(mainLine);

    // 2. Corner Bracket End-Caps (Top 0m & Bottom Max Depth)
    const topCapGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cornerX - 14, 0, cornerZ),
      new THREE.Vector3(cornerX + 8, 0, cornerZ),
      new THREE.Vector3(cornerX, 0, cornerZ),
      new THREE.Vector3(cornerX, 0, cornerZ - 14),
      new THREE.Vector3(cornerX, 0, cornerZ + 8),
    ]);
    const botCapGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cornerX - 14, -BOX_H, cornerZ),
      new THREE.Vector3(cornerX + 8, -BOX_H, cornerZ),
      new THREE.Vector3(cornerX, -BOX_H, cornerZ),
      new THREE.Vector3(cornerX, -BOX_H, cornerZ - 14),
      new THREE.Vector3(cornerX, -BOX_H, cornerZ + 8),
    ]);
    const capMat = new THREE.LineBasicMaterial({ color: 0x3fb6ff, opacity: 0.85, transparent: true });
    t.depthRulerGroup.add(new THREE.LineSegments(topCapGeo, capMat));
    t.depthRulerGroup.add(new THREE.LineSegments(botCapGeo, capMat));

    // 3. Title Sprite at top corner
    const titleSprite = createTextLabelSprite("DEPTH RANGE (m)", {
      isTitle: true,
      color: "#00f0ff",
      bgColor: "rgba(2, 12, 22, 0.96)",
      borderColor: "#00f0ff",
    });
    titleSprite.position.set(cornerX - 56, 32, cornerZ + 8);
    t.depthRulerGroup.add(titleSprite);

    // 4. Depth Level Ticks and 3D Labels along corner edge
    DEPTH_LEVELS.filter(d => d <= b.depthMax).forEach(d => {
      const y = depthToY(d);
      const isCurrentDepth = Math.abs(d - depth) < 5;

      // Tick mark extending outward from corner line
      const tickGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(cornerX, y, cornerZ),
        new THREE.Vector3(cornerX - (isCurrentDepth ? 30 : 20), y, cornerZ + (isCurrentDepth ? 12 : 6)),
      ]);
      const tickMat = new THREE.LineBasicMaterial({
        color: isCurrentDepth ? 0xffe052 : 0x00f0ff,
        transparent: true,
        opacity: isCurrentDepth ? 1.0 : 0.85,
        linewidth: isCurrentDepth ? 3.5 : 2,
      });
      t.depthRulerGroup.add(new THREE.Line(tickGeo, tickMat));

      // 3D Canvas Sprite for depth label
      const labelSprite = createTextLabelSprite(`${d}m`, {
        isHighlighted: isCurrentDepth,
        color: isCurrentDepth ? "#ffe052" : "#ffffff",
        borderColor: isCurrentDepth ? "#ffe052" : "#00f0ff",
      });
      labelSprite.position.set(cornerX - 54, y, cornerZ + 16);
      t.depthRulerGroup.add(labelSprite);
    });

    // 5. Active Slice Depth Indicator Cursor on corner line
    const activeY = depthToY(depth);

    // Highlight line notch spanning across the corner edge
    const activeNotchGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(cornerX, activeY, cornerZ),
      new THREE.Vector3(cornerX - 36, activeY, cornerZ + 14),
      new THREE.Vector3(cornerX, activeY, cornerZ),
      new THREE.Vector3(cornerX + 24, activeY, cornerZ),
      new THREE.Vector3(cornerX, activeY, cornerZ),
      new THREE.Vector3(cornerX, activeY, cornerZ - 24),
    ]);
    const activeNotchMat = new THREE.LineBasicMaterial({ color: 0xffe052, linewidth: 3.5 });
    t.depthRulerGroup.add(new THREE.LineSegments(activeNotchGeo, activeNotchMat));

    // Active Slice Badge Sprite
    const activeBadgeSprite = createTextLabelSprite(`▶ ACTIVE DEPTH: ${depth}m`, {
      isBadge: true,
      color: "#ffe052",
      bgColor: "rgba(24, 18, 4, 0.98)",
      borderColor: "#ffe052",
    });
    activeBadgeSprite.position.set(cornerX - 78, activeY, cornerZ + 36);
    t.depthRulerGroup.add(activeBadgeSprite);



  }, [depth, b.depthMax, showBox]);


  // ---- render the scalar slice whenever backend data changes ----
  useEffect(() => {
    const t = three.current;
    if (!t.sliceCtx || !sliceData) return;
    const { lats, lons, values, vmin, vmax } = sliceData;
    const nLat = lats.length, nLon = lons.length;
    const img = t.sliceCtx.createImageData(SLICE_RES, SLICE_RES);
    for (let j = 0; j < SLICE_RES; j++) {
      const li = Math.min(nLat - 1, Math.floor((j / (SLICE_RES - 1)) * (nLat - 1)));
      for (let i = 0; i < SLICE_RES; i++) {
        const lo = Math.min(nLon - 1, Math.floor((i / (SLICE_RES - 1)) * (nLon - 1)));
        const v = values[li][lo];
        const c = valueColor(variable, v);
        const p = (j * SLICE_RES + i) * 4;
        img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 255;
      }
    }
    t.sliceCtx.putImageData(img, 0, 0);
    t.sliceTex.needsUpdate = true;
    t.sliceMesh.position.y = depthToY(depth);
    onSliceRangeChange?.({ min: vmin, max: vmax });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliceData, variable, depth, b.latMin, b.latMax, b.lonMin, b.lonMax, b.depthMax]);

  // ---- currents ----
  useEffect(() => {
    const t = three.current;
    if (!t.currentGroup) return;
    t.currentGroup.clear();
    if (!showCurrents || !currentsData) return;
    const { lats, lons, u, v } = currentsData;
    const stride = 2; // Denser sampling for rich vector field visualization
    for (let j = 0; j < lats.length; j += stride) {
      for (let i = 0; i < lons.length; i += stride) {
        const uu = u[j][i], vv = v[j][i];
        const speed = Math.sqrt(uu * uu + vv * vv);
        if (speed < 0.01) continue;
        const dir = new THREE.Vector3(uu, 0, -vv).normalize();
        const origin = new THREE.Vector3(lonToX(lons[i]), depthToY(depth) + 2, latToZ(lats[j]));
        const len = Math.min(16, Math.max(5, speed * 25));

        const [r, g, bColor] = currentsColor(speed);
        const hexColor = (r << 16) | (g << 8) | bColor;

        const arrow = new THREE.ArrowHelper(dir, origin, len, hexColor, len * 0.28, len * 0.16);
        t.currentGroup.add(arrow);
      }
    }
  }, [showCurrents, currentsData, depth, b.latMin, b.latMax, b.lonMin, b.lonMax, b.depthMax]);

  // ---- Argo float & Glider markers & selection focus ----
  useEffect(() => {
    const t = three.current;
      if (!t.floatGroup) return;
      t.floatGroup.clear();

      const selStr = selectedFloatId ? String(selectedFloatId) : null;

      // 1. Render Argo Floats
      if (floats) {
        const sphereGeo = new THREE.SphereGeometry(6.5, 20, 20);
        floats.forEach(f => {
          const floatStrId = String(f.id);
          const isSelected = selStr === floatStrId;
          const x = lonToX(f.lon);
          const z = latToZ(f.lat);
          const y = 16;

          const mat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xffe052 : 0xff4252,
            emissive: isSelected ? 0x664400 : 0x440000,
            roughness: 0.3,
            metalness: 0.2,
          });

          const mesh = new THREE.Mesh(sphereGeo, mat);
          mesh.position.set(x, y, z);
          mesh.userData = { isFloat: true, floatId: floatStrId };
          mesh.visible = showArgo;

          if (showErrGrid && errorByFloat && errorByFloat[f.id] !== undefined) {
            const c = errColor(errorByFloat[f.id]);
            mat.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255);
            mat.emissive.setRGB(c[0] / 510, c[1] / 510, c[2] / 510);
          }

          const isAnomalous = anomalousFloatIds.includes(floatStrId);

          if (isAnomalous || (showAnomalies && isHighAnomaly(errorByFloat?.[f.id]))) {
            const ringGeo = new THREE.RingGeometry(10, 14, 32);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0xff3b5c,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.85,
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.position.set(x, y, z);
            ringMesh.rotation.x = Math.PI / 2;
            ringMesh.visible = showArgo;
            t.floatGroup.add(ringMesh);
          }

          mesh.scale.setScalar(isSelected ? 1.7 : isAnomalous ? 1.4 : 1.1);
          t.floatGroup.add(mesh);

          // Vertical tether line down to seafloor
          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, y, z),
            new THREE.Vector3(x, -BOX_H, z),
          ]);
          const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({
            color: isSelected ? 0xffe052 : isAnomalous ? 0xff4252 : 0x3fb6ff,
            dashSize: 6,
            gapSize: 4,
          }));
          line.computeLineDistances();
          line.visible = showArgo;
          t.floatGroup.add(line);

          // Smooth camera focus if selected
          if (isSelected && t.controls) {
            t.controls.target.set(x, -BOX_H / 4, z);
          }
        });
      }

      // 2. Render Copernicus Ocean Gliders
      if (gliders && gliders.length > 0) {
        const gliderGeo = new THREE.ConeGeometry(5.0, 14.0, 16);
        gliders.forEach(g => {
          const gliderIdStr = String(g.platform_id);
          const isSelected = selStr === gliderIdStr;
          const lat = g.latitude;
          const lon = g.longitude;
          const depthVal = g.depth || 0;

          // Map glider latitude and longitude into 3D volume cube coordinates
          const x = lonToX(lon);
          const z = latToZ(lat);
          const y = depthToY(depthVal);

          const mat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xffe052 : 0x00d2ff,
            emissive: isSelected ? 0x886600 : 0x003366,
            roughness: 0.2,
            metalness: 0.5,
          });

          const isGlidersVisible = showGliders !== undefined ? showGliders : showArgo;

          const gliderMesh = new THREE.Mesh(gliderGeo, mat);
          gliderMesh.rotation.z = Math.PI; // Point downwards into column
          gliderMesh.position.set(x, y, z);
          gliderMesh.userData = { isGlider: true, floatId: gliderIdStr };
          gliderMesh.visible = isGlidersVisible;
          t.floatGroup.add(gliderMesh);

          // Glider depth tether extending from sea surface down to glider depth
          const tetherGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(x, 16, z),
            new THREE.Vector3(x, y, z),
            new THREE.Vector3(x, -BOX_H, z),
          ]);
          const tetherLine = new THREE.Line(tetherGeo, new THREE.LineDashedMaterial({
            color: isSelected ? 0xffe052 : 0x00d2ff,
            dashSize: 5,
            gapSize: 3,
          }));
          tetherLine.computeLineDistances();
          tetherLine.visible = isGlidersVisible;
          t.floatGroup.add(tetherLine);

          // 3D Label Sprite for Glider
          const gliderSprite = createTextLabelSprite(`✈️ ${gliderIdStr}`, {
            isHighlighted: isSelected,
            color: isSelected ? "#ffe052" : "#00d2ff",
            borderColor: isSelected ? "#ffe052" : "#00d2ff",
          });
          gliderSprite.position.set(x, y + 16, z);
          gliderSprite.visible = isGlidersVisible;
          t.floatGroup.add(gliderSprite);

          if (isSelected && t.controls) {
            t.controls.target.set(x, y, z);
          }
        });
      }
    }, [floats, gliders, showArgo, showGliders, showErrGrid, errorByFloat, selectedFloatId, b.latMin, b.latMax, b.lonMin, b.lonMax, anomalousFloatIds, showAnomalies]);

function isHighAnomaly(err) {
  return err != null && Math.abs(err) > 1.8;
}

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}

export { DEPTH_LEVELS, DEFAULT_BOUNDS };
