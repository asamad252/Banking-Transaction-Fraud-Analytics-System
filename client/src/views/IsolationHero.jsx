// The sign-in page's centrepiece: a picture of how an Isolation Forest thinks.
// Random straight cuts split the data. A payment far from the crowd is alone
// after three cuts; one in the middle of the crowd is still surrounded after eight.
import { useState } from 'react';
import { animated, config, useSpring, useSprings } from '@react-spring/web';
import Icon from '../ui/Icon.jsx';

const W = 520;
const H = 400;

// Deterministic pseudo-random crowd, so the scene is identical on every load.
function crowd() {
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() || 1e-6)) * Math.cos(2 * Math.PI * rand());
  const points = [];
  while (points.length < 84) {
    const x = 190 + gauss() * 54;
    const y = 238 + gauss() * 46;
    if (x > 24 && x < 318 && y > 120 && y < 380) points.push({ x, y });
  }
  return points;
}
const CROWD = crowd();
const STRAYS = [{ x: 368, y: 138 }, { x: 446, y: 306 }];
const OUTLIER = { x: 424, y: 82 };
const ORDINARY = { x: 192, y: 236 };

// Each cut spans only the region still under consideration, exactly as a tree
// node only splits the points that reached it.
function plan(steps, start) {
  const box = { ...start };
  return steps.map(([axis, at, keep]) => {
    const segment = axis === 'x'
      ? { x1: at, y1: box.y0, x2: at, y2: box.y1 }
      : { x1: box.x0, y1: at, x2: box.x1, y2: at };
    if (axis === 'x') { if (keep === 'low') box.x1 = at; else box.x0 = at; }
    else if (keep === 'low') box.y1 = at; else box.y0 = at;
    return { ...segment, box: { ...box } };
  });
}
const FRAME = { x0: 8, y0: 8, x1: W - 8, y1: H - 8 };
const OUTLIER_CUTS = plan([['x', 345, 'high'], ['y', 176, 'low'], ['x', 394, 'high']], FRAME);
const ORDINARY_CUTS = plan(
  [['x', 262, 'low'], ['y', 178, 'high'], ['x', 132, 'high'], ['y', 296, 'low'],
    ['x', 222, 'low'], ['y', 212, 'high'], ['x', 166, 'high'], ['y', 262, 'low']],
  FRAME,
);

const T = { outlier: 900, gap: 430, found: 2350, ordinary: 3300, step: 260 };
const ORDINARY_DONE = T.ordinary + ORDINARY_CUTS.length * T.step + 250;

function Cut({ cut, spring, className }) {
  return (
    <animated.line
      className={className}
      x1={cut.x1}
      y1={cut.y1}
      x2={spring.t.to((t) => cut.x1 + (cut.x2 - cut.x1) * t)}
      y2={spring.t.to((t) => cut.y1 + (cut.y2 - cut.y1) * t)}
      opacity={spring.t.to((t) => (t > 0.001 ? 1 : 0))}
    />
  );
}

function Scene() {
  const dots = useSpring({ from: { opacity: 0 }, to: { opacity: 1 }, delay: 150, config: config.slow });

  const outlierCuts = useSprings(
    OUTLIER_CUTS.length,
    OUTLIER_CUTS.map((_, i) => ({ from: { t: 0 }, to: { t: 1 }, delay: T.outlier + i * T.gap, config: { tension: 160, friction: 24 } })),
  );
  const ordinaryCuts = useSprings(
    ORDINARY_CUTS.length,
    ORDINARY_CUTS.map((_, i) => ({ from: { t: 0 }, to: { t: 1 }, delay: T.ordinary + i * T.step, config: { tension: 200, friction: 26 } })),
  );

  const found = useSpring({ from: { r: 0, opacity: 0 }, to: { r: 17, opacity: 1 }, delay: T.found, config: config.wobbly });
  const crowded = useSpring({ from: { opacity: 0 }, to: { opacity: 1 }, delay: ORDINARY_DONE, config: config.gentle });
  const captionA = useSpring({ from: { opacity: 0, y: 8 }, to: { opacity: 1, y: 0 }, delay: T.found + 150 });
  const captionB = useSpring({ from: { opacity: 0, y: 8 }, to: { opacity: 1, y: 0 }, delay: ORDINARY_DONE });

  const lastOutlierBox = OUTLIER_CUTS[OUTLIER_CUTS.length - 1].box;
  const lastOrdinaryBox = ORDINARY_CUTS[ORDINARY_CUTS.length - 1].box;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="iso-plot" role="img" aria-label="Animation: random cuts isolate one unusual payment after three cuts, while a typical payment is still surrounded after eight.">
        <animated.rect
          className="iso-box-found"
          x={lastOutlierBox.x0}
          y={lastOutlierBox.y0}
          width={lastOutlierBox.x1 - lastOutlierBox.x0}
          height={lastOutlierBox.y1 - lastOutlierBox.y0}
          opacity={found.opacity}
        />
        <animated.rect
          className="iso-box-crowd"
          x={lastOrdinaryBox.x0}
          y={lastOrdinaryBox.y0}
          width={lastOrdinaryBox.x1 - lastOrdinaryBox.x0}
          height={lastOrdinaryBox.y1 - lastOrdinaryBox.y0}
          opacity={crowded.opacity}
        />

        <animated.g opacity={dots.opacity}>
          {CROWD.map((p, i) => <circle key={i} className="iso-dot" cx={p.x} cy={p.y} r="3.4" />)}
          {STRAYS.map((p, i) => <circle key={i} className="iso-dot" cx={p.x} cy={p.y} r="3.4" />)}
          <circle className="iso-dot iso-dot-ordinary" cx={ORDINARY.x} cy={ORDINARY.y} r="4.6" />
          <rect className="iso-outlier" x={OUTLIER.x - 5} y={OUTLIER.y - 5} width="10" height="10" transform={`rotate(45 ${OUTLIER.x} ${OUTLIER.y})`} />
        </animated.g>

        {ORDINARY_CUTS.map((cut, i) => <Cut key={i} cut={cut} spring={ordinaryCuts[i]} className="iso-cut iso-cut-ordinary" />)}
        {OUTLIER_CUTS.map((cut, i) => <Cut key={i} cut={cut} spring={outlierCuts[i]} className="iso-cut iso-cut-outlier" />)}

        <animated.circle className="iso-ring" cx={OUTLIER.x} cy={OUTLIER.y} r={found.r} opacity={found.opacity} />
      </svg>

      <ul className="iso-captions">
        <animated.li style={{ opacity: captionA.opacity, transform: captionA.y.to((y) => `translateY(${y}px)`) }}>
          <span className="iso-key iso-key-outlier" aria-hidden="true" />
          <span><strong>Alone after 3 cuts:</strong> flagged</span>
        </animated.li>
        <animated.li style={{ opacity: captionB.opacity, transform: captionB.y.to((y) => `translateY(${y}px)`) }}>
          <span className="iso-key iso-key-ordinary" aria-hidden="true" />
          <span><strong>Still in the crowd after 8:</strong> ordinary</span>
        </animated.li>
      </ul>
    </>
  );
}

export default function IsolationHero() {
  const [run, setRun] = useState(0);
  return (
    <figure className="iso">
      <figcaption className="iso-head">
        <button type="button" className="button button-ghost button-sm" onClick={() => setRun((r) => r + 1)}>
          <Icon name="replay" size={14} /> Replay
        </button>
      </figcaption>
      {/* Remounting restarts every spring from its starting value. */}
      <Scene key={run} />
    </figure>
  );
}
