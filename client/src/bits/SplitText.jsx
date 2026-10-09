// Staggered text reveal in the spirit of React Bits' "Split Text", driven by a
// react-spring trail instead of GSAP. Each word rises out of a blur in turn.
import { animated, useTrail } from '@react-spring/web';

export default function SplitText({ text, as: Tag = 'span', className, delay = 0 }) {
  const lines = text.split('\n').map((line) => line.split(' '));
  const words = lines.flat();

  const trail = useTrail(words.length, {
    from: { opacity: 0, y: 26, blur: 10 },
    to: { opacity: 1, y: 0, blur: 0 },
    delay,
    config: { mass: 1, tension: 190, friction: 24 },
  });

  let index = 0;
  return (
    // Screen readers get the sentence once, not word by word.
    <Tag className={className} aria-label={text.replace(/\n/g, ' ')}>
      {lines.map((line, l) => (
        <span className="split-line" aria-hidden="true" key={l}>
          {line.map((word, w) => {
            const spring = trail[index];
            index += 1;
            return (
              <animated.span
                key={w}
                className="split-word"
                style={{
                  opacity: spring.opacity,
                  transform: spring.y.to((y) => `translateY(${y}px)`),
                  filter: spring.blur.to((b) => `blur(${b}px)`),
                }}
              >
                {word}
                {w < line.length - 1 ? ' ' : ''}
              </animated.span>
            );
          })}
        </span>
      ))}
    </Tag>
  );
}
