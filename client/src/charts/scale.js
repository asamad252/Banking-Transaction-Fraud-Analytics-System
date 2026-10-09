// Just enough scale maths for the charts in this app.

export const linear = (d0, d1, r0, r1) => (v) => (d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

export const log10 = (d0, d1, r0, r1) => {
  const a = Math.log10(d0);
  const b = Math.log10(d1);
  return (v) => r0 + ((Math.log10(Math.max(v, d0)) - a) / (b - a)) * (r1 - r0);
};

/** Round axis maximum and evenly spaced ticks: 0, 2,000, 4,000 ... */
export function niceTicks(maxValue, target = 4) {
  if (!(maxValue > 0)) return { max: 1, ticks: [0, 1] };
  const rough = maxValue / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  const max = Math.ceil(maxValue / step) * step;
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { max, ticks };
}

/** Blue ramp for magnitude on a dark surface: dim = little, bright = a lot. */
const RAMP = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'];
export const rampColor = (value, max) => {
  if (!value || !max) return null;
  const index = Math.min(RAMP.length - 1, Math.floor((value / max) * RAMP.length - 1e-9));
  return RAMP[Math.max(0, index)];
};
export const RAMP_STEPS = RAMP;
