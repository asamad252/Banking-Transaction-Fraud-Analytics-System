// How strong the flags are: transactions per score band above the threshold.
// Bands are coloured by the severity they fall in, with a matching legend.
import { animated, useSpring } from '@react-spring/web';
import { useMeasure } from '../hooks.js';
import { linear, niceTicks } from './scale.js';

const M = { left: 34, right: 8, top: 10, bottom: 26 };
const HEIGHT = 190;
const levelOf = (bucket) => (bucket >= 17 ? 'critical' : bucket >= 14 ? 'high' : 'medium');

function Column({ x, width, base, top, level, title }) {
  const spring = useSpring({ from: { h: 0 }, h: base - top, config: { tension: 200, friction: 26 } });
  const r = Math.min(4, width / 2);
  return (
    <animated.path
      className={`mark-${level}`}
      d={spring.h.to((h) => {
        if (h < 0.5) return '';
        const t = base - h;
        const rr = Math.min(r, h);
        return `M${x},${base}V${t + rr}Q${x},${t} ${x + rr},${t}H${x + width - rr}Q${x + width},${t} ${x + width},${t + rr}V${base}Z`;
      })}
    >
      <title>{title}</title>
    </animated.path>
  );
}

export default function SeverityHistogram({ buckets }) {
  const [ref, width] = useMeasure();
  // Buckets 10-19 cover scores 0.50-1.00 in steps of 0.05.
  const flagged = buckets.filter((b) => b.bucket >= 10);
  const { max, ticks } = niceTicks(Math.max(...flagged.map((b) => b.n), 1), 3);
  const plotW = Math.max(0, width - M.left - M.right);
  const band = plotW / 10;
  const barW = Math.min(24, band - 2);
  const y = linear(0, max, HEIGHT - M.bottom, M.top);

  return (
    <div className="chart-wrap" ref={ref}>
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Number of flagged transactions in each anomaly score band">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis' : 'grid'} x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{t}</text>
            </g>
          ))}
          {flagged.map((b, i) => (
            <Column
              key={b.bucket}
              x={M.left + i * band + (band - barW) / 2}
              width={barW}
              base={HEIGHT - M.bottom}
              top={y(b.n)}
              level={levelOf(b.bucket)}
              title={`Score ${(b.bucket / 20).toFixed(2)}–${((b.bucket + 1) / 20).toFixed(2)}: ${b.n} transactions`}
            />
          ))}
          {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((score) => (
            <text key={score} className="tick" x={M.left + (score - 0.5) * 20 * band} y={HEIGHT - 8} textAnchor="middle">
              {score.toFixed(1)}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
