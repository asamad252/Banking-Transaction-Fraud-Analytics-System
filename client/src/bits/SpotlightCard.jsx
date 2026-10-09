// Card with a soft light that follows the pointer (after React Bits'
// "Spotlight Card"). Position is written straight to CSS variables so moving
// the mouse never re-renders React; a spring fades the light in and out.
import { useRef } from 'react';
import { animated, useSpring } from '@react-spring/web';

export default function SpotlightCard({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useRef(null);
  const [glow, api] = useSpring(() => ({ opacity: 0, config: { tension: 170, friction: 26 } }));

  const track = (event) => {
    const box = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--spot-x', `${event.clientX - box.left}px`);
    ref.current.style.setProperty('--spot-y', `${event.clientY - box.top}px`);
  };

  return (
    <Tag
      ref={ref}
      className={`spotlight ${className}`}
      onPointerMove={track}
      onPointerEnter={() => api.start({ opacity: 1 })}
      onPointerLeave={() => api.start({ opacity: 0 })}
      {...rest}
    >
      <animated.span className="spotlight-glow" style={glow} aria-hidden="true" />
      {children}
    </Tag>
  );
}
