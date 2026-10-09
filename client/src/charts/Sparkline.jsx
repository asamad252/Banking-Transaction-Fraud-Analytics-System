// Tiny trend line for a stat. Quiet stroke, with the latest value marked.
export default function Sparkline({ values, width = 132, height = 36, label }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const px = (i) => 2 + (i / (values.length - 1)) * (width - 8);
  const py = (v) => height - 4 - ((v - min) / span) * (height - 8);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join('');
  const last = values.length - 1;
  return (
    <svg className="sparkline" width={width} height={height} role="img" aria-label={label}>
      <path d={d} />
      <circle cx={px(last)} cy={py(values[last])} r="3" />
    </svg>
  );
}
