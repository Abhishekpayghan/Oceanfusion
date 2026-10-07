import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import GlobeControls from './GlobeControls';
import GlobeInfoPanel from './GlobeInfoPanel';
import ObservationProfileModal from './ObservationProfileModal';
import * as api from '../services/api';

const GLOBE_RADIUS = 120;

/** Exact geospatial 3D coordinate mapping for sphere (R = GLOBE_RADIUS)
 * Matches standard Three.js SphereGeometry equirectangular UV mapping.
 */
function latLonToVector3(lat, lon, radius = GLOBE_RADIUS, alt = 0.6) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  const r = radius + alt;
  return new THREE.Vector3(
    -(r * Math.sin(phi) * Math.cos(theta)),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Strict ocean geospatial validator -- returns false for any coordinate falling on land */
function isPointInOcean(lat, lon) {
  if (lat == null || lon == null) return false;
  // North of 20.5°N anywhere in South Asia is land
  if (lat >= 20.5 && lon >= 60.0 && lon <= 100.0) return false;
  // Indian Subcontinent landmass
  if (lat >= 8.0 && lat <= 20.5) {
    if (lat <= 12.0 && lon >= 76.0 && lon <= 79.8) return false;
    if (lat > 12.0 && lat <= 16.0 && lon >= 73.8 && lon <= 80.5) return false;
    if (lat > 16.0 && lon >= 72.5 && lon <= 87.5) return false;
  }
  // Sri Lanka
  if (lat >= 5.8 && lat <= 9.9 && lon >= 79.4 && lon <= 82.2) return false;
  // Bangladesh / Myanmar / SE Asia
  if (lat >= 15.0 && lon >= 89.0) return false;
  if (lat >= 9.0 && lon >= 97.5) return false;
  if (lat >= 0.0 && lon >= 98.0) return false;
  // Arabian Peninsula
  if (lat >= 12.0 && lon <= 53.5) return false;
  if (lat >= 15.0 && lon <= 59.0) return false;
  if (lat >= 22.0 && lon <= 61.5) return false;
  // East Africa / Somalia
  if (lat >= -12.0 && lon <= 41.5) return false;
  if (lat >= 0.0 && lon <= 43.5) return false;
  // Madagascar
  if (lat >= -26.0 && lat <= -11.5 && lon >= 43.0 && lon <= 50.8) return false;
  // Australia
  if (lat <= -11.5 && lon >= 113.0) return false;
  return true;
}

/** Create illuminated latitude/longitude grid rings on the 3D Globe */
function createLatLonGridGroup(radius = GLOBE_RADIUS) {
  const gridGroup = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35 });
  const equatorMat = new THREE.LineBasicMaterial({ color: 0xffe052, transparent: true, opacity: 0.65 });

  // Parallels (Latitudes)
  const lats = [-60, -30, -15, 0, 15, 30, 60];
  lats.forEach(lat => {
    const phi = (90 - lat) * (Math.PI / 180);
    const r = radius * Math.sin(phi) * 1.002;
    const y = radius * Math.cos(phi) * 1.002;
    const points = [];
    const segments = 120;
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, lat === 0 ? equatorMat : lineMat);
    gridGroup.add(line);
  });

  // Meridians (Longitudes)
  const lons = [0, 30, 60, 90, 120, 150, 180, -150, -120, -90, -60, -30];
  lons.forEach(lon => {
    const points = [];
    const segments = 120;
    for (let i = 0; i <= segments; i++) {
      const lat = (i / segments) * 180 - 90;
      points.push(latLonToVector3(lat, lon, radius, 0.2));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, lon === 60 || lon === 90 ? equatorMat : lineMat);
    gridGroup.add(line);
  });

  return gridGroup;
}

/** Create realistic cloud texture for 3D earth cloud layer */
function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft cumulus cloud belts
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const rad = 30 + Math.random() * 70;
    const alpha = 0.12 + Math.random() * 0.22;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.6, `rgba(245, 250, 255, ${alpha * 0.5})`);
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/** Generate 3D symbol group by observation platform type */
function createPlatformSymbol(type, color, isSelected, isSearchMatch) {
  const group = new THREE.Group();
  const hexColor = isSelected ? 0xffe052 : color;

  const mainMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    emissive: isSelected ? 0xaa7700 : 0x003344,
    roughness: 0.2,
    metalness: 0.4,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x666666,
    roughness: 0.1,
  });

  if (type === 'argo') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 12), mainMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const collarMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.2 });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 16), collarMat);
    collar.rotation.x = Math.PI / 2;
    group.add(collar);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), accentMat);
    antenna.position.z = 1.4;
    antenna.rotation.x = Math.PI / 2;
    group.add(antenna);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    beacon.position.z = 2.1;
    group.add(beacon);

  } else if (type === 'glider') {
    const fuse = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.0, 10), mainMat);
    fuse.rotation.x = -Math.PI / 2;
    group.add(fuse);

    const wingMat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.2 });
    const wings = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.07, 0.45), wingMat);
    wings.position.z = 0.2;
    group.add(wings);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.45), wingMat);
    tail.position.set(0, 0.35, -0.65);
    group.add(tail);

  } else if (type === 'buoy') {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.4, 0.8, 12), mainMat);
    hull.rotation.x = Math.PI / 2;
    group.add(hull);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, 1.2, 8), accentMat);
    mast.position.z = 0.9;
    mast.rotation.x = Math.PI / 2;
    group.add(mast);

    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
    beacon.position.z = 1.5;
    group.add(beacon);

  } else if (type === 'ctd') {
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 10, 1, true), mainMat);
    frame.rotation.x = Math.PI / 2;
    group.add(frame);

    const bottleMat = new THREE.MeshStandardMaterial({ color: 0xff3b5c, roughness: 0.2 });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.95, 8), bottleMat);
      b.position.set(Math.cos(ang) * 0.45, Math.sin(ang) * 0.45, 0);
      b.rotation.x = Math.PI / 2;
      group.add(b);
    }
  } else {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 6), mainMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd977f6 }));
    dome.position.z = 0.8;
    dome.rotation.x = -Math.PI / 2;
    group.add(dome);
  }

  const baseScale = isSelected ? 2.6 : isSearchMatch ? 2.0 : 1.3;
  group.scale.setScalar(baseScale);
  return group;
}

// Indian Ocean Bounding Box for 2D Map (Lat -30..30, Lon 30..120)
const MAP_BOUNDS = { latMin: -30, latMax: 30, lonMin: 30, lonMax: 120 };

export default function IndianOceanGlobe({ onStudyIn3D, initialRegion = 'bay_of_bengal' }) {
  const hostRef = useRef(null);
  const mapContainerRef = useRef(null);
  const threeRef = useRef({});

  // Display mode: 'globe' (3D INCOIS Globe) | 'map' (2D INCOIS Cartographic Map)
  const [viewType, setViewType] = useState('globe');

  // Observations data state
  const [observations, setObservations] = useState([]);
  const [counts, setCounts] = useState({ argo: 0, glider: 0, buoy: 0, ctd: 0, bgc: 0 });
  const [layerStatus, setLayerStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Filter & Layer state
  const [layerToggles, setLayerToggles] = useState({
    argo: true, glider: true, buoy: true, ctd: true, bgc: true,
  });
  const [searchId, setSearchId] = useState('');

  // Selected observation & modals
  const [selectedObs, setSelectedObs] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [hoveredObs, setHoveredObs] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Live Lat/Lon Cursor Tracker for 2D Map
  const [cursorCoords, setCursorCoords] = useState({ lat: 12.5, lon: 75.0, name: 'Indian Ocean' });

  // Load observation markers from /api/observations
  useEffect(() => {
    setLoading(true);
    api.fetchObservations({ region: 'all' })
      .then(res => {
        setObservations(res.observations || []);
        setCounts(res.counts_by_type || { argo: res.observations?.length || 0 });
        setLayerStatus(res.layer_status);
        setLoading(false);
      })
      .catch(err => {
        console.error("Globe observations load error:", err);
        setLoading(false);
      });
  }, []);

  // Initialize Three.js 3D Globe Scene with Bright INCOIS Atmospheric Lighting
  useEffect(() => {
    if (viewType !== 'globe') return;
    const host = hostRef.current;
    if (!host) return;

    const w = host.clientWidth > 0 ? host.clientWidth : (window.innerWidth || 1200);
    const h = host.clientHeight > 0 ? host.clientHeight : (window.innerHeight - 56 || 800);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 1, 3000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.65; // High clarity bright exposure
    host.appendChild(renderer.domElement);

    // Starfield
    const starGeo = new THREE.BufferGeometry();
    const starCoords = [];
    const starColors = [];
    for (let i = 0; i < 3000; i++) {
      const u = Math.random(), v = Math.random();
      const theta = u * 2.0 * Math.PI, phi = Math.acos(2.0 * v - 1.0);
      const r = 1200 + Math.random() * 800;
      starCoords.push(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
      const isCyan = Math.random() > 0.5;
      starColors.push(isCyan ? 0.3 : 1.0, isCyan ? 0.95 : 1.0, 1.0);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starCoords, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({ size: 2.0, vertexColors: true, transparent: true, opacity: 0.9 });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Bright INCOIS Sunlight + Ambient Fill Lights
    const ambientLight = new THREE.AmbientLight(0xd0e8ff, 1.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5dd, 2.8);
    sunLight.position.set(400, 250, 350);
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x00e5ff, 0.85);
    fillLight.position.set(-350, -200, -250);
    scene.add(fillLight);

    // Earth Globe Sphere with Specular High-Gloss Texture
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load('/earth_satellite.jpg');
    earthTexture.colorSpace = THREE.SRGBColorSpace;

    const globeGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64);
    const globeMat = new THREE.MeshPhongMaterial({
      color: 0x144066,
      map: earthTexture,
      shininess: 45,
      specular: new THREE.Color(0x00f0ff),
    });
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    scene.add(globeMesh);

    // Rotating Cloud Layer
    const cloudTexture = createCloudTexture();
    const cloudGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.008, 64, 64);
    const cloudMat = new THREE.MeshPhongMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.42,
      blending: THREE.NormalBlending,
      depthWrite: false,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    scene.add(cloudMesh);

    // Dual Volumetric Atmosphere Glow Layers (Electric Cyan + Azure Rim Light)
    const innerAtmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.018, 48, 48);
    const innerAtmoMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Mesh(innerAtmoGeo, innerAtmoMat));

    const outerAtmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.042, 48, 48);
    const outerAtmoMat = new THREE.MeshBasicMaterial({
      color: 0x0088ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Mesh(outerAtmoGeo, outerAtmoMat));

    // Latitude / Longitude Grid Overlay
    const latLonGrid = createLatLonGridGroup(GLOBE_RADIUS);
    scene.add(latLonGrid);

    // Observation 3D markers group
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);

    // OrbitControls -- target Indian Ocean (Center ~ 0°N, 75°E)
    const controls = new OrbitControls(camera, renderer.domElement);
    const targetVector = latLonToVector3(0, 75, GLOBE_RADIUS, 230);
    camera.position.copy(targetVector);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = GLOBE_RADIUS * 1.25;
    controls.maxDistance = GLOBE_RADIUS * 4.5;
    controls.update();

    // Raycasting for marker interaction
    const raycaster = new THREE.Raycaster();
    const mouseNDC = new THREE.Vector2();

    function onPointerMove(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      setMousePos({ x: e.clientX, y: e.clientY });

      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObjects(markerGroup.children, true);
      if (hits.length > 0) {
        let parent = hits[0].object;
        while (parent && !parent.userData.isMarker && parent.parent) {
          parent = parent.parent;
        }
        if (parent && parent.userData.observation) {
          setHoveredObs(parent.userData.observation);
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      setHoveredObs(null);
      renderer.domElement.style.cursor = 'default';
    }

    function onPointerClick(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObjects(markerGroup.children, true);
      if (hits.length > 0) {
        let parent = hits[0].object;
        while (parent && !parent.userData.isMarker && parent.parent) {
          parent = parent.parent;
        }
        if (parent && parent.userData.observation) {
          setSelectedObs(parent.userData.observation);
        }
      }
    }

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onPointerClick);

    function resize() {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const resizeObs = new ResizeObserver(resize);
    resizeObs.observe(host);
    setTimeout(resize, 50);
    requestAnimationFrame(resize);

    let raf;
    function animate() {
      raf = requestAnimationFrame(animate);
      cloudMesh.rotation.y += 0.0002;
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    threeRef.current = {
      scene, camera, renderer, controls, globeMesh, markerGroup,
    };

    return () => {
      cancelAnimationFrame(raf);
      resizeObs.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onPointerClick);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, [viewType]);

  // Render 3D platform symbols on Globe
  useEffect(() => {
    if (viewType !== 'globe') return;
    const t = threeRef.current;
    if (!t.markerGroup) return;
    t.markerGroup.clear();

    const activeSearch = searchId.trim().toLowerCase();

    observations.forEach(obs => {
      if (!layerToggles[obs.type]) return;
      if (!isPointInOcean(obs.latitude, obs.longitude)) return;

      const isSearchMatch = activeSearch && String(obs.id).toLowerCase().includes(activeSearch);
      const isSelected = selectedObs && selectedObs.id === obs.id;

      const color = obs.type === 'argo' ? 0x00f0ff
        : obs.type === 'glider' ? 0x00d2ff
        : obs.type === 'buoy' ? 0xffcc00
        : obs.type === 'ctd' ? 0xff3b5c
        : 0xd977f6;

      const pos = latLonToVector3(obs.latitude, obs.longitude, GLOBE_RADIUS, isSelected ? 2.2 : 0.8);
      const symbolGroup = createPlatformSymbol(obs.type, color, isSelected, isSearchMatch);

      symbolGroup.position.copy(pos);
      symbolGroup.lookAt(0, 0, 0);
      symbolGroup.userData = { isMarker: true, observation: obs };

      t.markerGroup.add(symbolGroup);

      if (isSelected || isSearchMatch) {
        const ringGeo = new THREE.RingGeometry(2.2, 3.6, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe052, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.copy(pos);
        ringMesh.lookAt(0, 0, 0);
        t.markerGroup.add(ringMesh);
      }
    });

    // Render selected Glider Trajectory Track Route Line on Globe
    if (selectedObs && selectedObs.type === 'glider') {
      api.fetchGliderTrack(selectedObs.id).then(res => {
        if (res && res.track && res.track.length > 1 && threeRef.current.markerGroup) {
          const points = res.track.map(pt => latLonToVector3(pt.latitude, pt.longitude, GLOBE_RADIUS, 1.2));
          const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x00ff88, linewidth: 3, transparent: true, opacity: 0.9 });
          const trackLine = new THREE.Line(lineGeo, lineMat);
          threeRef.current.markerGroup.add(trackLine);
        }
      }).catch(err => console.warn('Glider track fetch error:', err));
    }
  }, [observations, layerToggles, selectedObs, searchId, viewType]);

  // Preset Camera Focus Animation for Globe
  const handleSelectPreset = useCallback((preset) => {
    const t = threeRef.current;
    if (!t.controls || !t.camera) return;

    const targetPos = latLonToVector3(preset.lat, preset.lon, GLOBE_RADIUS, 230 / preset.zoom);
    t.camera.position.copy(targetPos);
    t.controls.target.set(0, 0, 0);
    t.controls.update();
  }, []);

  // Handle "Study in 3D" navigation trigger
  const handleStudyIn3D = useCallback((obs) => {
    if (!obs) return;
    onStudyIn3D?.({
      floatId: String(obs.id),
      lat: obs.latitude,
      lon: obs.longitude,
      last_cycle_day: obs.last_cycle_day || 1,
    });
  }, [onStudyIn3D]);

  // Calculate 2D map pixel coordinates (Lat -30..30, Lon 30..120)
  function getMapMarkerStyle(lat, lon) {
    const xPct = ((lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * 100;
    const yPct = ((MAP_BOUNDS.latMax - lat) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * 100;
    return {
      left: `${Math.max(2, Math.min(98, xPct))}%`,
      top: `${Math.max(2, Math.min(98, yPct))}%`,
    };
  }

  // Handle mouse move on 2D map to track live latitude/longitude
  const handleMapMouseMove = (e) => {
    if (!mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;

    const lon = MAP_BOUNDS.lonMin + xRatio * (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin);
    const lat = MAP_BOUNDS.latMax - yRatio * (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin);

    let name = 'Indian Ocean';
    if (lat >= 10 && lat <= 24 && lon >= 55 && lon <= 76) name = 'Arabian Sea';
    else if (lat >= 8 && lat <= 22 && lon >= 80 && lon <= 98) name = 'Bay of Bengal';
    else if (lat >= -10 && lat <= 10 && lon >= 50 && lon <= 100) name = 'Equatorial Indian Ocean';
    else if (lat < -10) name = 'Southern Indian Ocean';

    setCursorCoords({ lat, lon, name });
  };

  return (
    <div style={styles.outerContainer}>
      {/* Top INCOIS Data Stream Header Banner */}
      <div style={styles.incoisBanner}>
        <div style={styles.bannerLeft}>
          <span style={styles.incoisBadge}>ESSO - INCOIS</span>
          <span style={styles.bannerTitle}>Indian Ocean Observation Discovery Portal</span>
        </div>
        <div style={styles.bannerPills}>
          <span style={styles.livePill}>● INCOIS ERDDAP: LIVE</span>
          <span style={styles.statPill}>⚓ RAMA / OMNI BUOYS</span>
          <span style={styles.statPill}>📡 {counts.argo || 0} ARGO FLOATS</span>
        </div>
      </div>

      {/* 3D Satellite Globe Container */}
      {viewType === 'globe' && (
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
      )}

      {/* 2D Bright INCOIS Cartographic Satellite Map */}
      {viewType === 'map' && (
        <div
          ref={mapContainerRef}
          style={styles.mapContainer}
          onMouseMove={handleMapMouseMove}
        >
          {/* High clarity, vivid sat map */}
          <img
            src="/indian_ocean_satellite.jpg"
            alt="Indian Ocean Satellite Map"
            style={styles.satelliteImg}
          />

          {/* Cartographic ocean bathymetry glow overlay */}
          <div style={styles.mapOceanGlow} />

          {/* Precision Lat / Lon Cartographic Grid Lines */}
          <div style={styles.mapCartoGrid} />

          {/* Latitude Border Ticks & Labels */}
          <div style={styles.latLabelTop}>30°N · Arabian Sea & Bay of Bengal</div>
          <div style={styles.latLabelMidN}>15°N · Central North Indian Ocean</div>
          <div style={styles.latLabelEquator}>0° · Equatorial Current Belt</div>
          <div style={styles.latLabelMidS}>15°S · South Equatorial Current</div>
          <div style={styles.latLabelBottom}>30°S · Southern Indian Ocean Subtropical Gyre</div>

          {/* Longitude Border Ticks & Labels */}
          <div style={{ ...styles.lonLabel, left: '5%' }}>30°E</div>
          <div style={{ ...styles.lonLabel, left: '25%' }}>60°E</div>
          <div style={{ ...styles.lonLabel, left: '50%' }}>75°E</div>
          <div style={{ ...styles.lonLabel, left: '68%' }}>90°E</div>
          <div style={{ ...styles.lonLabel, left: '92%' }}>120°E</div>

          {/* INCOIS North Arrow / Compass Indicator */}
          <div style={styles.compassContainer}>
            <div style={styles.compassArrow}>▲</div>
            <div style={styles.compassLabel}>N</div>
          </div>

          {/* Map Scale Bar */}
          <div style={styles.scaleBarContainer}>
            <div style={styles.scaleBarLine}>
              <span style={styles.scaleBarTickLeft} />
              <span style={styles.scaleBarTickRight} />
            </div>
            <div style={styles.scaleBarLabel}>500 km / 270 nmi</div>
          </div>

          {/* Cursor Coordinates HUD */}
          <div style={styles.cursorHud}>
            <span style={styles.hudIcon}>📍</span>
            <span>
              {fmtLat(cursorCoords.lat)} {fmtLon(cursorCoords.lon)} · <b style={{ color: '#00f0ff' }}>{cursorCoords.name}</b>
            </span>
          </div>

          {/* Map Legend Box */}
          <div style={styles.mapLegendCard}>
            <div style={styles.legendHeader}>INCOIS FEED LEGEND</div>
            <div style={styles.legendRow}><span style={{ ...styles.legendDot, background: '#00f0ff' }} /> Argo Floats ({counts.argo})</div>
            <div style={styles.legendRow}><span style={{ ...styles.legendDot, background: '#00d2ff' }} /> Gliders ({counts.glider})</div>
            <div style={styles.legendRow}><span style={{ ...styles.legendDot, background: '#ffcc00' }} /> Moored Buoys ({counts.buoy})</div>
            <div style={styles.legendRow}><span style={{ ...styles.legendDot, background: '#ff3b5c' }} /> CTD Casts ({counts.ctd})</div>
          </div>

          {/* Observation Markers overlaid on 2D Satellite Map */}
          {observations.map(obs => {
            if (!layerToggles[obs.type]) return null;
            if (!isPointInOcean(obs.latitude, obs.longitude)) return null;
            const isSelected = selectedObs && selectedObs.id === obs.id;
            const isMatch = searchId && String(obs.id).includes(searchId.trim());
            const posStyle = getMapMarkerStyle(obs.latitude, obs.longitude);

            const color = obs.type === 'argo' ? '#00f0ff'
              : obs.type === 'glider' ? '#00d2ff'
              : obs.type === 'buoy' ? '#ffcc00'
              : obs.type === 'ctd' ? '#ff3b5c'
              : '#d977f6';

            const icon = obs.type === 'argo' ? '📡'
              : obs.type === 'glider' ? '✈️'
              : obs.type === 'buoy' ? '⚓'
              : obs.type === 'ctd' ? '🧪'
              : '🟣';

            return (
              <div
                key={obs.id}
                style={{
                  ...styles.mapMarker,
                  ...posStyle,
                  transform: isSelected ? 'translate(-50%, -50%) scale(1.45)' : isMatch ? 'translate(-50%, -50%) scale(1.3)' : 'translate(-50%, -50%)',
                  borderColor: isSelected ? '#ffe052' : color,
                  boxShadow: isSelected ? '0 0 16px #ffe052, 0 0 8px #00f0ff' : `0 0 10px ${color}bb`,
                  background: 'rgba(6, 26, 44, 0.95)',
                }}
                onClick={() => setSelectedObs(obs)}
                onMouseEnter={(e) => {
                  setHoveredObs(obs);
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setHoveredObs(null)}
              >
                <span style={{ fontSize: 11 }}>{icon}</span>

                {/* Float ID tag label */}
                {(isSelected || isMatch) && (
                  <div style={styles.markerTagLabel}>
                    #{obs.id}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Controls Overlay */}
      <GlobeControls
        layerToggles={layerToggles}
        onToggleLayer={(key, val) => setLayerToggles(prev => ({ ...prev, [key]: val }))}
        onShowAll={() => setLayerToggles({ argo: true, glider: true, buoy: true, ctd: true, bgc: true })}
        onHideAll={() => setLayerToggles({ argo: false, glider: false, buoy: false, ctd: false, bgc: false })}
        counts={counts}
        layerStatus={layerStatus}
        searchId={searchId}
        onSearchChange={setSearchId}
        onSelectPreset={handleSelectPreset}
        viewType={viewType}
        onChangeViewType={setViewType}
      />

      {/* Selected Observation Info Card */}
      {selectedObs && (
        <GlobeInfoPanel
          observation={selectedObs}
          onClose={() => setSelectedObs(null)}
          onViewProfile={() => setShowProfileModal(true)}
          onStudyIn3D={handleStudyIn3D}
        />
      )}

      {/* Hover Tooltip */}
      {hoveredObs && !selectedObs && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 14,
          top: mousePos.y + 14,
          background: 'rgba(6, 26, 44, 0.95)',
          border: '1px solid #00f0ff',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 12,
          color: '#ffffff',
          pointerEvents: 'none',
          zIndex: 60,
          boxShadow: '0 8px 24px rgba(0,240,255,0.25)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ color: '#00f0ff', fontWeight: 700 }}>
            {hoveredObs.type.toUpperCase()} PLATFORM #{hoveredObs.id}
          </div>
          <div style={{ color: '#8fb4c4', fontSize: 11, marginTop: 2 }}>
            {fmtLat(hoveredObs.latitude)}, {fmtLon(hoveredObs.longitude)}
          </div>
          {hoveredObs.variables?.temperature != null && (
            <div style={{ color: '#ffe052', fontSize: 11, fontWeight: 700, marginTop: 4 }}>
              Temp: {hoveredObs.variables.temperature.toFixed(1)} °C
            </div>
          )}
        </div>
      )}

      {/* Vertical Profile Plotly Modal */}
      {showProfileModal && selectedObs && (
        <ObservationProfileModal
          observation={selectedObs}
          onClose={() => setShowProfileModal(false)}
          onStudyIn3D={handleStudyIn3D}
        />
      )}

      {loading && (
        <div style={styles.loadingBox}>
          Connecting to INCOIS ERDDAP stream...
        </div>
      )}
    </div>
  );
}

function fmtLat(v) { return v != null ? `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}` : '—'; }
function fmtLon(v) { return v != null ? `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}` : '—'; }

const styles = {
  outerContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    background: 'radial-gradient(ellipse at center, #0a2540 0%, #03101d 100%)',
  },
  incoisBanner: {
    position: 'absolute',
    top: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(6, 26, 44, 0.88)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(0, 240, 255, 0.35)',
    borderRadius: 24,
    padding: '6px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    zIndex: 15,
    boxShadow: '0 6px 24px rgba(0, 240, 255, 0.15)',
  },
  bannerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  incoisBadge: {
    background: 'linear-gradient(135deg, #00f0ff 0%, #0088ff 100%)',
    color: '#03101d',
    fontWeight: 800,
    fontSize: 11,
    padding: '3px 9px',
    borderRadius: 12,
    letterSpacing: '0.04em',
  },
  bannerTitle: {
    fontSize: 12.5,
    fontWeight: 700,
    color: '#ffffff',
  },
  bannerPills: {
    display: 'flex',
    gap: 8,
  },
  livePill: {
    fontSize: 10.5,
    fontWeight: 700,
    color: '#00ff88',
    background: 'rgba(0, 255, 136, 0.12)',
    border: '1px solid rgba(0, 255, 136, 0.3)',
    padding: '2px 8px',
    borderRadius: 10,
  },
  statPill: {
    fontSize: 10.5,
    fontWeight: 600,
    color: '#8fb4c4',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: '2px 8px',
    borderRadius: 10,
  },
  mapContainer: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    background: '#041628',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  satelliteImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    filter: 'brightness(1.15) contrast(1.12) saturate(1.15)',
  },
  mapOceanGlow: {
    position: 'absolute',
    inset: 0,
    background: 'radial-gradient(circle at 60% 45%, rgba(0, 240, 255, 0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  mapCartoGrid: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(to right, rgba(0, 240, 255, 0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 240, 255, 0.18) 1px, transparent 1px)',
    backgroundSize: '100px 100px',
    pointerEvents: 'none',
  },
  latLabelTop: {
    position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
    color: '#00f0ff', fontSize: 11, fontWeight: 700, background: 'rgba(6, 26, 44, 0.85)',
    border: '1px solid rgba(0, 240, 255, 0.3)', padding: '3px 10px', borderRadius: 6,
  },
  latLabelMidN: {
    position: 'absolute', top: '30%', left: 290,
    color: 'rgba(0, 240, 255, 0.75)', fontSize: 10.5, fontWeight: 600, background: 'rgba(6, 26, 44, 0.75)',
    padding: '2px 6px', borderRadius: 4,
  },
  latLabelEquator: {
    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    color: '#ffe052', fontSize: 11, fontWeight: 800, background: 'rgba(6, 26, 44, 0.85)',
    border: '1px solid #ffe052', padding: '3px 10px', borderRadius: 6, pointerEvents: 'none',
  },
  latLabelMidS: {
    position: 'absolute', top: '70%', left: 290,
    color: 'rgba(0, 240, 255, 0.75)', fontSize: 10.5, fontWeight: 600, background: 'rgba(6, 26, 44, 0.75)',
    padding: '2px 6px', borderRadius: 4,
  },
  latLabelBottom: {
    position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
    color: '#00f0ff', fontSize: 11, fontWeight: 700, background: 'rgba(6, 26, 44, 0.85)',
    border: '1px solid rgba(0, 240, 255, 0.3)', padding: '3px 10px', borderRadius: 6,
  },
  lonLabel: {
    position: 'absolute', bottom: 16,
    color: 'rgba(0, 240, 255, 0.85)', fontSize: 10.5, fontWeight: 700, background: 'rgba(6, 26, 44, 0.75)',
    padding: '2px 6px', borderRadius: 4,
  },
  compassContainer: {
    position: 'absolute', top: 56, right: 20,
    width: 38, height: 38, borderRadius: '50%',
    background: 'rgba(6, 26, 44, 0.88)', border: '1px solid #00f0ff',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0, 240, 255, 0.3)',
  },
  compassArrow: { color: '#ff3b5c', fontSize: 12, lineHeight: 1 },
  compassLabel: { color: '#ffffff', fontSize: 10, fontWeight: 800 },

  scaleBarContainer: {
    position: 'absolute', bottom: 20, right: 20,
    background: 'rgba(6, 26, 44, 0.88)', border: '1px solid rgba(0, 240, 255, 0.3)',
    borderRadius: 6, padding: '4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  scaleBarLine: {
    width: 90, height: 2, background: '#00f0ff', position: 'relative', margin: '4px 0 2px 0',
  },
  scaleBarTickLeft: {
    position: 'absolute', left: 0, top: -3, width: 2, height: 8, background: '#00f0ff',
  },
  scaleBarTickRight: {
    position: 'absolute', right: 0, top: -3, width: 2, height: 8, background: '#00f0ff',
  },
  scaleBarLabel: { fontSize: 10, fontWeight: 700, color: '#00f0ff' },

  cursorHud: {
    position: 'absolute', bottom: 20, left: 295,
    background: 'rgba(6, 26, 44, 0.9)', border: '1px solid #00f0ff',
    borderRadius: 6, padding: '5px 12px', fontSize: 11.5, color: '#ffffff',
    display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 14px rgba(0, 240, 255, 0.2)',
  },
  hudIcon: { fontSize: 12 },

  mapLegendCard: {
    position: 'absolute', top: 56, left: 295,
    background: 'rgba(6, 26, 44, 0.88)', border: '1px solid rgba(0, 240, 255, 0.3)',
    borderRadius: 8, padding: '8px 12px', fontSize: 11, color: '#ffffff',
  },
  legendHeader: { fontSize: 10, fontWeight: 700, color: '#00f0ff', marginBottom: 4, letterSpacing: '0.04em' },
  legendRow: { display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' },
  legendDot: { width: 8, height: 8, borderRadius: '50%' },

  mapMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: '50%',
    border: '2px solid #00f0ff',
    cursor: 'pointer',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },
  markerTagLabel: {
    position: 'absolute',
    top: -20,
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#ffe052',
    color: '#03101d',
    fontSize: 9.5,
    fontWeight: 800,
    padding: '1px 5px',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
  },
  loadingBox: {
    position: 'absolute', top: 60, right: 20,
    background: 'rgba(6, 26, 44, 0.9)', padding: '8px 16px',
    borderRadius: 8, fontSize: 12, color: '#00f0ff',
    border: '1px solid #00f0ff', zIndex: 20,
  },
};
