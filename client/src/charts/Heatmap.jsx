// Day-of-week by hour-of-day grid. One hue: brighter cells hold more flags.
import { useState } from 'react';
import { RAMP_STEPS, rampColor } from './scale.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (h) => String(h).padStart(2, '0');

export default function Heatmap({ cells }) {
  const [active, setActive] = useState(null); // { dow, hour }

  const lookup = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c]));
  const max = Math.max(...cells.map((c) => c.flagged), 0);
  const get = (dow, hour) => lookup.get(`${dow}-${hour}`) || { flagged: 0, transactions: 0 };

  const onKeyDown = (event) => {
    const moves = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    if (event.key === 'Escape') return setActive(null);
    const move = moves[event.key];
    if (!move) return undefined;
    event.preventDefault();
    return setActive((a) => {
      const from = a || { dow: 1, hour: 0 };
      return {
        dow: Math.min(7, Math.max(1, from.dow + move[0])),
        hour: Math.min(23, Math.max(0, from.hour + move[1])),
      };
    });
  };

  const current = active && get(active.dow, active.hour);

  return (
    <div className="heatmap">
      <div
        className="heatmap-grid"
        role="img"
        aria-label="Flagged transactions by day of week and hour. Use arrow keys to read each cell."
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((a) => a || { dow: 1, hour: 0 })}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {DAYS.map((name, d) => (
          <div className="heatmap-row" key={name}>
            <span className="heatmap-day">{name}</span>
            {Array.from({ length: 24 }, (_, hour) => {
              const cell = get(d + 1, hour);
              const isActive = active?.dow === d + 1 && active?.hour === hour;
              return (
                <span
                  key={hour}
                  className={`heatmap-cell ${isActive ? 'is-active' : ''}`}
                  style={{ background: rampColor(cell.flagged, max) || undefined }}
                  onPointerEnter={() => setActive({ dow: d + 1, hour })}
                />
              );
            })}
          </div>
        ))}
        <div className="heatmap-row heatmap-hours" aria-hidden="true">
          <span className="heatmap-day" />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="heatmap-hour">{hour % 3 === 0 ? pad(hour) : ''}</span>
          ))}
        </div>
      </div>

      <div className="heatmap-foot">
        <p className="heatmap-readout" aria-live="polite">
          {current ? (
            <>
              <strong>{current.flagged} flagged</strong> of {current.transactions} transactions on{' '}
              {DAYS[active.dow - 1]} {pad(active.hour)}:00–{pad(active.hour)}:59 UTC
            </>
          ) : (
            'Point at a cell to read it.'
          )}
        </p>
        <div className="ramp-legend" aria-hidden="true">
          <span>0</span>
          <span className="ramp-swatch ramp-zero" />
          {RAMP_STEPS.map((color) => <span key={color} className="ramp-swatch" style={{ background: color }} />)}
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
}
