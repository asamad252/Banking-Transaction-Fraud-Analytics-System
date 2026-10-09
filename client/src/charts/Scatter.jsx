// Amount (log scale) against anomaly score. Ordinary transactions recede in
// grey; flagged ones stand out in the alert colour and a different shape, so
// the distinction never rests on colour alone.
import { useMemo, useState } from 'react';
import { animated, useSpring } from '@react-spring/web';
import { useMeasure } from '../hooks.js';
import { money, typeLabel } from '../format.js';
import { linear, log10 } from './scale.js';
import { ChartTip } from './ChartCard.jsx';

const M = { left: 44, right: 16, top: 14, bottom: 40 };
const HEIGHT = 300;
const X_TICKS = [1, 10, 100, 1_000, 10_000, 100_000];
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];
const tickLabel = (v) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`);

export default function Scatter({ points, threshold = 0.5 }) {
  const [ref, width] = useMeasure();
  const [hover, setHover] = useState(null);
  const fade = useSpring({ from: { opacity: 0 }, opacity: 1, config: { tension: 80, friction: 26 } });

  const maxAmount = Math.max(...points.map((p) => p.amount), 1000);
  const xMax = X_TICKS.find((t) => t >= maxAmount) || 1_000_000;
  const x = log10(1, xMax, M.left, width - M.right);
  const y = linear(0, 1, HEIGHT - M.bottom, M.top);

  const placed = useMemo(
    () => points.map((p) => ({ ...p, px: x(p.amount), py: y(p.anomaly_score) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, width, xMax],
  );

  // Nearest point within reach, so the pointer only has to be close.
  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    let best = null;
    let bestDistance = 26 * 26;
    for (const p of placed) {
      const d = (p.px - mx) ** 2 + (p.py - my) ** 2;
      // Flagged points win ties: they are the ones people are looking for.
      if (d < bestDistance || (d === bestDistance && p.is_anomaly)) { best = p; bestDistance = d; }
    }
    setHover(best);
  };

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label="Scatter plot of transaction amount against anomaly score. The table view lists the flagged transactions."
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {Y_TICKS.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t.toFixed(2)}</text>
            </g>
          ))}
          {X_TICKS.filter((t) => t <= xMax).map((t) => (
            <text key={t} className="tick" x={x(t)} y={HEIGHT - M.bottom + 16} textAnchor="middle">{tickLabel(t)}</text>
          ))}
          <text className="axis-title" x={(M.left + width - M.right) / 2} y={HEIGHT - 4} textAnchor="middle">
            Transaction amount (log scale)
          </text>

          <line className="threshold" x1={M.left} x2={width - M.right} y1={y(threshold)} y2={y(threshold)} />
          <text className="threshold-label" x={M.left + 6} y={y(threshold) - 7}>
            Flagged above this line
          </text>

          <animated.g style={fade}>
            {placed.filter((p) => !p.is_anomaly).map((p) => (
              <circle key={p.id} className="dot-ordinary" cx={p.px} cy={p.py} r="3" />
            ))}
            {placed.filter((p) => p.is_anomaly).map((p) => (
              <rect
                key={p.id}
                className="dot-flagged"
                x={p.px - 4}
                y={p.py - 4}
                width="8"
                height="8"
                transform={`rotate(45 ${p.px} ${p.py})`}
              />
            ))}
          </animated.g>

          {hover && <circle className="dot-ring" cx={hover.px} cy={hover.py} r="9" pointerEvents="none" />}
        </svg>
      )}
      <ChartTip x={hover ? hover.px : null} y={hover ? hover.py : 0} width={width}>
        {hover && (
          <>
            <div className="tip-title">{hover.customer_name}</div>
            <div className="tip-row"><strong>{money(hover.amount)}</strong> {typeLabel(hover.type).toLowerCase()}</div>
            <div className="tip-row"><strong>{hover.anomaly_score.toFixed(2)}</strong> anomaly score</div>
          </>
        )}
      </ChartTip>
    </div>
  );
}
