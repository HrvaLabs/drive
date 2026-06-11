import type { Tip } from '../types';

const ICON: Record<string, string> = { good: '✅', warn: '⚠️', info: '💡' };

interface Props {
  tips: Tip[];
}

export default function TipsCard({ tips }: Props) {
  if (tips.length === 0) {
    return null;
  }
  return (
    <section className="card">
      <h3 className="section-title">Tips</h3>
      <div className="tips">
        {tips.map((t) => (
          <div key={t.id} className={`tip tip--${t.severity}`}>
            <div className="tip__head">
              <span>{ICON[t.severity] ?? '•'} {t.title}</span>
              {t.eurImpact != null && t.eurImpact > 0 && (
                <span className="tip__eur">≈ €{t.eurImpact.toFixed(2)}</span>
              )}
            </div>
            <div className="tip__detail">{t.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
