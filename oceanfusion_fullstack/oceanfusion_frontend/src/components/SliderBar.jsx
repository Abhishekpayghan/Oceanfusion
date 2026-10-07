import { useEffect, useState, useRef } from 'react';

export default function SliderBar({ depth, onDepthChange, day, onDayChange, nDays }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 1x, 1.5x, 2x
  const timerRef = useRef(null);

  const speedMs = Math.round(1600 / speed);

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        onDayChange(prev => (prev >= nDays ? 1 : prev + 1));
      }, speedMs);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, nDays, onDayChange, speedMs]);

  const togglePlay = () => {
    setIsPlaying(prev => !prev);
  };

  const cycleSpeed = () => {
    setSpeed(prev => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1));
  };

  const handleSliderChange = (e) => {
    setIsPlaying(false);
    onDayChange(Number(e.target.value));
  };

  return (
    <footer style={styles.footer}>
      {/* Depth Slider Block */}
      <div style={{ ...styles.block, maxWidth: 300 }}>
        <span style={styles.lbl}>DEPTH</span>
        <input
          type="range" min="0" max="1000" step="10" value={depth}
          onChange={e => onDepthChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--current)' }}
        />
        <span style={styles.val}>{depth} m</span>
      </div>

      {/* Timeline Controls Block */}
      <div style={{ ...styles.block, flex: 2, gap: 16 }}>
        {/* Regenerated Cybernetic Play/Pause Button */}
        <button
          onClick={togglePlay}
          style={{
            ...styles.playBtn,
            background: isPlaying ? 'rgba(32, 211, 194, 0.22)' : 'var(--deep)',
            borderColor: isPlaying ? '#20d3c2' : 'var(--line)',
            boxShadow: isPlaying ? '0 0 14px rgba(32,211,194,0.45)' : 'none',
          }}
          title={isPlaying ? "Pause synchronized playback" : "Start synchronized daywise playback"}
        >
          <span style={{ fontSize: 14, color: isPlaying ? '#20d3c2' : 'var(--foam)' }}>
            {isPlaying ? '❚❚' : '▶'}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: isPlaying ? '#20d3c2' : 'var(--mist)' }}>
            {isPlaying ? 'PAUSE' : 'PLAY'}
          </span>
        </button>

        {/* Speed Toggle Switch */}
        <button
          onClick={cycleSpeed}
          style={styles.speedBtn}
          title="Change playback speed (1x / 1.5x / 2x)"
        >
          ⚡ {speed}x
        </button>

        {/* Timeline Slider Track & Day Markers */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mist)' }}>
            <span style={{ fontWeight: 600, letterSpacing: 0.5 }}>SYNCHRONIZED TIMELINE</span>
            <span style={{ fontFamily: 'var(--mono)', color: '#20d3c2', fontWeight: 700 }}>
              Day {day} of {nDays}
            </span>
          </div>

          <input
            type="range" min="1" max={nDays} step="1" value={day}
            onChange={handleSliderChange}
            style={{ width: '100%', accentColor: 'var(--current)', cursor: 'pointer', height: 6 }}
          />

          {/* Interactive Day Step Tick Dots */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 2px', marginTop: 2 }}>
            {Array.from({ length: nDays }).map((_, i) => {
              const stepDay = i + 1;
              const isActive = stepDay === day;
              const isPassed = stepDay < day;
              return (
                <div
                  key={stepDay}
                  onClick={() => { setIsPlaying(false); onDayChange(stepDay); }}
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: isActive ? '#20d3c2' : isPassed ? 'rgba(32,211,194,0.45)' : 'var(--line)',
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    transform: isActive ? 'scale(1.4)' : 'scale(1)',
                    boxShadow: isActive ? '0 0 8px #20d3c2' : 'none',
                  }}
                  title={`Jump to Day ${stepDay}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </footer>
  );
}

const styles = {
  footer: {
    background: 'var(--panel)', borderTop: '1px solid var(--line)',
    display: 'flex', alignItems: 'center', gap: 24, padding: '0 24px', height: 96,
  },
  block: { flex: 1, display: 'flex', alignItems: 'center', gap: 12 },
  lbl: { width: 52, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: 'var(--mist)', flexShrink: 0 },
  val: { width: 68, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5, flexShrink: 0, color: 'var(--foam)' },
  playBtn: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
    borderRadius: 20, border: '1px solid var(--line)',
    cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s ease',
  },
  speedBtn: {
    background: 'rgba(6, 20, 31, 0.8)', border: '1px solid var(--line)',
    borderRadius: 6, color: 'var(--foam)', fontSize: 11, fontWeight: 600,
    padding: '6px 10px', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s ease',
  },
};
