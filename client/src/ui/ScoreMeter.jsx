// Anomaly score as a meter. The fill springs to the score; its colour steps
// with severity, and the 0.5 flag threshold is marked on the track.
import { animated, useSpring } from '@react-spring/web';

export const severityOf = (score) => {
  if (score === null || score === undefined) return 'none';
  if (score >= 0.85) return 'critical';
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  return 'ordinary';
};

const SEVERITY_TEXT = {
  critical: 'Critical', high: 'High', medium: 'Medium', ordinary: 'Ordinary', none: 'Not scored',
};

export default function ScoreMeter({ score, compact = false }) {
  const level = severityOf(score);
  const { width } = useSpring({
    from: { width: 0 },
    width: (score ?? 0) * 100,
    config: { tension: 150, friction: 24 },
  });

  if (level === 'none') return <span className="meter-none">Not scored</span>;
  return (
    <div className={`meter meter-${level} ${compact ? 'meter-compact' : ''}`}>
      <div
        className="meter-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={score}
        aria-label={`Anomaly score ${score.toFixed(2)}, ${SEVERITY_TEXT[level].toLowerCase()}`}
      >
        <animated.div className="meter-fill" style={{ width: width.to((w) => `${w}%`) }} />
        <span className="meter-threshold" aria-hidden="true" />
      </div>
      <span className="meter-value">{score.toFixed(2)}</span>
    </div>
  );
}

export function SeverityBadge({ severity }) {
  if (!severity) return null;
  return (
    <span className={`badge badge-${severity}`}>
      <span className="badge-mark" aria-hidden="true" />
      {SEVERITY_TEXT[severity]}
    </span>
  );
}
