import { useState, useCallback } from 'react';
import RegionSelect from './pages/RegionSelect';
import Dashboard from './pages/Dashboard';
import IndianOceanGlobe from './components/IndianOceanGlobe';
import Header from './components/Header';
import './styles/theme.css';

function detectRegionForCoords(lat, lon, currentRegion) {
  if (lat >= 10 && lat <= 24 && lon >= 54 && lon <= 76) return 'arabian_sea';
  if (lat >= 8 && lat <= 22 && lon >= 80 && lon <= 98) return 'bay_of_bengal';
  if (lat >= -10 && lat <= 10 && lon >= 50 && lon <= 100) return 'equatorial_io';
  if (lat >= -30 && lat <= -10 && lon >= 60 && lon <= 110) return 'south_io';
  return currentRegion || 'bay_of_bengal';
}

export default function App() {
  const [region, setRegion] = useState(null); // Selected region key
  const [viewMode, setViewMode] = useState('region_select'); // 'region_select' | 'globe' | 'analysis'
  const [initialFloatId, setInitialFloatId] = useState(null);

  const handleSelectRegion = (selectedKey) => {
    setRegion(selectedKey);
    setViewMode('analysis');
  };

  const handleStudyIn3D = useCallback((obsData) => {
    const matchedRegion = detectRegionForCoords(obsData.lat, obsData.lon, region);
    setRegion(matchedRegion);
    setInitialFloatId(obsData.floatId);
    setViewMode('analysis');
  }, [region]);

  const handleSelectView = (targetMode) => {
    if (targetMode === 'region_select') {
      setViewMode('region_select');
    } else if (targetMode === 'globe') {
      setViewMode('globe');
    } else if (targetMode === 'analysis') {
      if (!region) {
        setRegion('bay_of_bengal');
      }
      setViewMode('analysis');
    }
  };

  if (viewMode === 'region_select') {
    return (
      <div style={{ display: 'grid', gridTemplateRows: '56px 1fr', height: '100vh' }}>
        <Header
          viewMode="region_select"
          onSelectView={handleSelectView}
          apiOk={true}
        />
        <RegionSelect onSelectRegion={handleSelectRegion} />
      </div>
    );
  }

  if (viewMode === 'globe') {
    return (
      <div style={{ display: 'grid', gridTemplateRows: '56px 1fr', height: '100vh' }}>
        <Header
          viewMode="globe"
          onSelectView={handleSelectView}
          apiOk={true}
        />
        <IndianOceanGlobe
          onStudyIn3D={handleStudyIn3D}
          initialRegion={region || 'bay_of_bengal'}
        />
      </div>
    );
  }

  return (
    <Dashboard
      region={region || 'bay_of_bengal'}
      onChangeRegion={() => setViewMode('region_select')}
      initialFloatId={initialFloatId}
      viewMode="analysis"
      onSelectView={handleSelectView}
    />
  );
}
