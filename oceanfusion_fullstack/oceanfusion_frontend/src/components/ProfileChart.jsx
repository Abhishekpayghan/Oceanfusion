import { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

/** profile: { depths, model, observed, variable } from GET /api/argo/{id} */
export default function ProfileChart({ profile }) {
  const ref = useRef(null);

  useEffect(() => {
    return () => {
      if (ref.current) {
        Plotly.purge(ref.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!ref.current || !profile) return;
    const el = ref.current;
    const { depths, model, observed, variable } = profile;
    Plotly.react(
      el,
      [
        { x: model, y: depths, mode: 'lines+markers', name: 'Model', line: { color: '#20d3c2', width: 2.5 } },
        { x: observed, y: depths, mode: 'lines+markers', name: 'Argo obs', line: { color: '#ff9a56', width: 2.5 } },
      ],
      {
        margin: { l: 36, r: 10, t: 8, b: 26 }, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
        font: { color: '#8fb4c4', size: 10 },
        yaxis: { autorange: 'reversed', title: 'depth (m)', gridcolor: '#153649' },
        xaxis: { title: variable === 'temp' ? '°C' : 'PSU', gridcolor: '#153649' },
        legend: { orientation: 'h', y: 1.2, font: { size: 9 } },
        datarevision: Date.now(),
      },
      { displayModeBar: false, responsive: true }
    );
  }, [profile]);


  return <div ref={ref} style={{ width: '100%', height: 150, margin: '8px 0 4px' }} />;
}
