// Number that springs to its value (after React Bits' "Count Up"). Re-targets
// smoothly from wherever it is when `value` changes, e.g. after a filter change.
import { animated, useSpring } from '@react-spring/web';

const defaultFormat = (n) => Math.round(n).toLocaleString('en-US');

export default function CountUp({ value, format = defaultFormat, className }) {
  const { n } = useSpring({
    from: { n: 0 },
    n: Number(value) || 0,
    config: { mass: 1, tension: 140, friction: 28, clamp: true },
  });
  return <animated.span className={className}>{n.to(format)}</animated.span>;
}
