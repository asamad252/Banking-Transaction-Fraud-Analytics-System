// Two stacked plots that share one time axis and one hover readout:
// money moved per day (line) and flagged transactions per day (columns).
// They are separate plots on purpose - dollars and counts never share a y-axis.
import { useState } from 'react';
import { animated, useSpring } from '@react-spring/web';
import { useMeasure } from '../hooks.js';
import { count, day as formatDay, longDay, moneyCompact, moneyWhole } from '../format.js';
import { linear, niceTicks } from './scale.js';
import { ChartTip } from './ChartCard.jsx';

const M = { left: 52, right: 14 };
const TOP = { y: 22, h: 150 };       // volume plot
const BOTTOM = { y: 214, h: 64 };    // flagged plot
const HEIGHT = 306;

function Column({ x, width, y0, y1, active }) {
  const spring = useSpring({ from: { h: 0 }, h: y0 - y1, config: { tension: 210, friction: 26 } });
  const r = Math.min(4, width / 2);
  return (
    <animated.path
      className={`mark-flagged ${active ? 'is-active' : ''}`}
      // Rounded at the data end, square on the baseline.
      d={spring.h.to((h) => {
        if (h < 0.5) return '';
        const top = y0 - h;
        const rr = Math.min(r, h);
        return `M${x},${y0}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + width - rr}Q${x + width},${top} ${x + width},${top + rr}V${y0}Z`;
      })}
    />
  );
}

export default function DailyActivity({ data }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);

  // Today is still in progress, so the line stops at yesterday and today is a
  // detached marker rather than a misleading plunge.
  const draw = useSpring({ from: { offset: 1 }, offset: 0, config: { tension: 60, friction: 22 } });

  const n = data.length;
  const plotW = Math.max(0, width - M.left - M.right);
  const x = (i) => M.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);

  const volume = niceTicks(Math.max(...data.map((d) => d.volume), 1), 3);
  const flagged = niceTicks(Math.max(...data.map((d) => d.flagged), 1), 2);
  const yVolume = linear(0, volume.max, TOP.y + TOP.h, TOP.y);
  const yFlagged = linear(0, flagged.max, BOTTOM.y + BOTTOM.h, BOTTOM.y);

  const complete = data.slice(0, -1);
  const line = complete.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yVolume(d.volume).toFixed(1)}`).join('');
  const area = complete.length
    ? `${line}L${x(complete.length - 1).toFixed(1)},${TOP.y + TOP.h}L${x(0).toFixed(1)},${TOP.y + TOP.h}Z`
    : '';

  const band = n > 1 ? plotW / (n - 1) : plotW;
  const barW = Math.max(2, Math.min(24, band - 2));
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 78))));

  const pick = (clientX, target) => {
    const box = target.getBoundingClientRect();
    const i = Math.round(((clientX - box.left - M.left) / Math.max(plotW, 1)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKeyDown = (event) => {
    if (event.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
    else if (event.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1));
    else if (event.key === 'Escape') setHover(null);
    else return;
    event.preventDefault();
  };

  const point = hover !== null ? data[hover] : null;
  const today = data[n - 1];

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Daily transaction volume and flagged transactions. Use arrow keys to read each day."
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((h) => h ?? n - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={onKeyDown}
        >
          <text className="plot-label" x={M.left} y={12}>Money moved</text>
          {volume.ticks.map((t) => (
            <g key={`v${t}`}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={M.left} x2={width - M.right} y1={yVolume(t)} y2={yVolume(t)} />
              <text className="tick" x={M.left - 8} y={yVolume(t)} dy="0.32em" textAnchor="end">{moneyCompact(t)}</text>
            </g>
          ))}
          <path className="area-volume" d={area} />
          <animated.path className="line-volume" d={line} pathLength="1" strokeDasharray="1" strokeDashoffset={draw.offset} />
          {today && n > 1 && (
            <circle className="dot-today" cx={x(n - 1)} cy={yVolume(today.volume)} r="4" />
          )}

          <text className="plot-label" x={M.left} y={BOTTOM.y - 12}>Flagged transactions</text>
          {flagged.ticks.map((t) => (
            <g key={`f${t}`}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={M.left} x2={width - M.right} y1={yFlagged(t)} y2={yFlagged(t)} />
              <text className="tick" x={M.left - 8} y={yFlagged(t)} dy="0.32em" textAnchor="end">{t}</text>
            </g>
          ))}
          {data.map((d, i) => (
            <Column
              key={d.day}
              x={Math.min(Math.max(x(i) - barW / 2, M.left), width - M.right - barW)}
              width={barW}
              y0={BOTTOM.y + BOTTOM.h}
              y1={yFlagged(d.flagged)}
              active={hover === i}
            />
          ))}

          {data.map((d, i) => (i % labelEvery === 0 && i < n - 1) || i === n - 1 ? (
            <text
              key={d.day}
              className="tick"
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor={i === n - 1 ? 'end' : 'middle'}
              // Skip a regular label that would collide with the final "Today".
              visibility={i !== n - 1 && x(n - 1) - x(i) < 70 ? 'hidden' : 'visible'}
            >
              {i === n - 1 ? 'Today' : formatDay(d.day)}
            </text>
          ) : null)}

          {point && (
            <g pointerEvents="none">
              <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={TOP.y} y2={BOTTOM.y + BOTTOM.h} />
              <circle className="dot-hover" cx={x(hover)} cy={yVolume(point.volume)} r="5" />
            </g>
          )}
        </svg>
      )}
      <ChartTip x={point ? x(hover) : null} y={TOP.y + 54} width={width}>
        {point && (
          <>
            <div className="tip-title">{hover === n - 1 ? `${longDay(point.day)} (so far)` : longDay(point.day)}</div>
            <div className="tip-row"><span className="tip-key tip-line" style={{ '--key': 'var(--series-1)' }} /><strong>{moneyWhole(point.volume)}</strong> moved</div>
            <div className="tip-row"><span className="tip-key" /><strong>{count(point.transactions)}</strong> transactions</div>
            <div className="tip-row"><span className="tip-key tip-line" style={{ '--key': 'var(--critical)' }} /><strong>{count(point.flagged)}</strong> flagged</div>
          </>
        )}
      </ChartTip>
    </div>
  );
}
