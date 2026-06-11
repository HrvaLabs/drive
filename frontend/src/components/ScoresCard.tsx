import type { CSSProperties } from 'react';
import type { Scores } from '../types';

function fmtSecs(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

interface Props {
  scores: Scores;
  eventCount: number;
  idleSeconds?: number;
}

export default function ScoresCard({ scores, eventCount, idleSeconds }: Props) {
  return (
    <section className="card">
      <h3 className="section-title">Driving score</h3>
      <div className="score">
        <div className="score__dial">
          <div className="gauge" style={{ '--v': scores.eco } as CSSProperties}
               role="img" aria-label={`Eco score ${scores.eco} out of 100`}>
            <div className="score__big" aria-hidden="true">{scores.eco}</div>
          </div>
          <div className="score__style">{scores.style} driver</div>
          <div className="score__caption">rough index · higher is greener</div>
        </div>
        <ul className="score__list">
          <li>In best RPM band: <strong>{scores.rpmBandPct}%</strong>
            <span className="score__hint">time spent at an efficient 1500–2500 rpm — higher is better</span></li>
          <li>Idling: <strong>{scores.idlePct}%</strong>{idleSeconds ? ` · ${fmtSecs(idleSeconds)}` : ''}
            <span className="score__hint">engine running while stopped — lower is better</span></li>
          <li>Speed steadiness: <strong>{scores.speedSteadiness}</strong>/100
            <span className="score__hint">how smoothly you held speed — higher means less stop-and-go</span></li>
          <li><strong>{eventCount} events</strong> detected ({scores.harshEvents} harsh)
            <span className="score__hint">harsh = a hard brake or hard acceleration</span></li>
        </ul>
      </div>
      <details className="score__how">
        <summary>How is this calculated?</summary>
        <p>Score (0–100) blends <strong>40%</strong> time in the efficient 1500–2500 rpm band,
        <strong> 30%</strong> speed steadiness and <strong>30%</strong> low idling, minus
        <strong> 3 points per harsh event</strong> (capped at −30). Higher is greener.</p>
      </details>
    </section>
  );
}
