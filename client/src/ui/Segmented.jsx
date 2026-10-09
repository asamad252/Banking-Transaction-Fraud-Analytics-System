// Segmented control whose highlight slides between options on a spring.
import { useLayoutEffect, useRef } from 'react';
import { animated, useSpring } from '@react-spring/web';

export default function Segmented({ options, value, onChange, label, size = 'md' }) {
  const container = useRef(null);
  const buttons = useRef({});
  const placed = useRef(false);
  const [pill, api] = useSpring(() => ({ x: 0, width: 0, opacity: 0, config: { tension: 340, friction: 32 } }));

  useLayoutEffect(() => {
    const place = () => {
      const el = buttons.current[value];
      if (!el) return;
      // The first placement snaps; later ones travel.
      api.start({ x: el.offsetLeft, width: el.offsetWidth, opacity: 1, immediate: !placed.current });
      placed.current = true;
    };
    place();
    // Web fonts and window resizes change button widths after first paint.
    const observer = new ResizeObserver(() => { placed.current = false; place(); });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [value, options.length, api]);

  return (
    <div className={`segmented segmented-${size}`} role="group" aria-label={label} ref={container}>
      <animated.span
        className="segmented-pill"
        aria-hidden="true"
        style={{ width: pill.width, opacity: pill.opacity, transform: pill.x.to((x) => `translateX(${x}px)`) }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          ref={(el) => { buttons.current[option.value] = el; }}
          className="segmented-option"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className="segmented-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}
