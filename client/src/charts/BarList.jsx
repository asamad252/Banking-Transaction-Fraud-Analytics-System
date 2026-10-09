// Horizontal bars for comparing a handful of named categories. One series,
// one colour; the value sits at the bar's tip and the bar springs to length.
import { animated, useSpring } from '@react-spring/web';

function Bar({ fraction }) {
  const spring = useSpring({ from: { w: 0 }, w: fraction * 100, config: { tension: 190, friction: 26 } });
  // The longest bar stops short of the edge so its value label always fits beside it.
  return <animated.span className="barlist-bar" style={{ width: spring.w.to((w) => `calc((100% - 132px) * ${(w / 100).toFixed(4)})`) }} />;
}

export default function BarList({ rows, valueLabel, detail }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="barlist">
      {rows.map((row) => (
        <li key={row.key} className="barlist-row" tabIndex={0} title={detail ? detail(row) : undefined}>
          <span className="barlist-label">{row.label}</span>
          <span className="barlist-track">
            <Bar fraction={row.value / max} />
            <span className="barlist-value">{valueLabel(row)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
