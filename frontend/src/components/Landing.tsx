import type { ReactNode } from 'react';
import Uploader from './Uploader';

interface Props {
  files: File[];
  setFiles: (f: File[]) => void;
  pricePerL: string;
  setPricePerL: (v: string) => void;
  cars: import('../history/types').Car[];
  selectedCarVin: string;
  setSelectedCarVin: (vin: string) => void;
  onAddCar: (file: File) => void;
  onRemoveCar: (vin: string) => void;
  onRenameCar: (vin: string) => void;
  onDecodeCar: (vin: string) => void;
  decodingVin: string;
  onAnalyze: () => void;
  loading: boolean;
}

function Icon({ d, extra }: { d: string; extra?: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
      {extra}
    </svg>
  );
}

const ICONS = {
  gauge: <Icon d="M4 16.5a8 8 0 1 1 16 0 M12 16.5l4.1-6" extra={<circle cx="12" cy="16.5" r="1.3" fill="currentColor" stroke="none" />} />,
  route: <Icon d="M5 19c5.5 0 3-6.5 8.5-6.5S16 6.5 19 5" extra={<><circle cx="5" cy="19" r="1.6" /><circle cx="19" cy="5" r="1.6" /></>} />,
  euro: <Icon d="M17.5 7.5a6.5 6.5 0 1 0 0 9 M5.5 10.5H13 M5.5 13.5H13" />,
  wrench: <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
  file: <Icon d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6" />,
  printer: <Icon d="M7 8V4h10v4 M5 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" extra={<rect x="7" y="13" width="10" height="8" rx="1" />} />,
};

const FEATURES: Array<{ icon: ReactNode; title: string; body: string }> = [
  { icon: ICONS.gauge, title: 'Drive summary', body: 'Distance, time, fuel used, € cost and L/100 km — the whole drive at a glance.' },
  { icon: ICONS.route, title: 'Route map', body: 'Your drive mapped and speed-coloured, with hard-brake, idle and coasting events pinned.' },
  { icon: ICONS.euro, title: 'Eco & cost coaching', body: 'A driving score plus €-quantified tips: idling, short-shifting, your efficient cruising speed.' },
  { icon: ICONS.wrench, title: 'Engine insights', body: 'RPM, boost, coolant, battery and fuel-trim — in plain language, with a full expert view.' },
  { icon: ICONS.file, title: 'Any export', body: 'Vertical or horizontal Car Scanner CSV, plus an optional .brc to decode your VIN and engine.' },
  { icon: ICONS.printer, title: 'Shareable report', body: 'Save the whole report as a clean PDF in one click. Friendly by default, debug on demand.' },
];

const STEPS: Array<{ n: string; title: string; body: string }> = [
  { n: '1', title: 'Record & export', body: 'Log a drive in the Car Scanner ELM OBD2 app, then export the recording as CSV.' },
  { n: '2', title: 'Upload', body: 'Drop the CSV here — add the optional .brc for your VIN and engine. Nothing is stored.' },
  { n: '3', title: 'Read your drive', body: 'Get an instant report: summary, map, tips, graphs and engine health.' },
];

// Keep these answers in sync with the FAQPage JSON-LD in index.html.
const FAQ: Array<{ q: string; a: string }> = [
  { q: 'What is HrvaDrive?', a: 'A free web tool that turns a Car Scanner OBD2 drive log into a readable report — drive summary, route map, eco and cost tips, and engine insights.' },
  { q: 'What file do I upload?', a: 'A Car Scanner ELM OBD2 CSV export (vertical or horizontal layout). You can optionally add the .brc file to show your VIN and engine.' },
  { q: 'Is my driving data private?', a: 'Yes. HrvaDrive is stateless — your drive is analysed and the report is returned to you; nothing is stored and no account is needed.' },
  { q: 'Does it cost anything?', a: 'No. HrvaDrive is free to use.' },
  { q: 'What can it tell me?', a: 'Your fuel cost and economy, an eco-driving score, where you braked hard or idled, your most efficient cruising speed, and engine-health flags like battery voltage.' },
];

export default function Landing(props: Props) {
  return (
    <>
      <section className="hero">
        <p className="hero__eyebrow">OBD2 drive intelligence</p>
        <h1 className="hero__title">Understand <em>every</em> drive.</h1>
        <p className="hero__sub">
          Upload a Car Scanner OBD2 export and get an instant, readable report — summary, map,
          eco &amp; cost tips, and engine insights. Free, private, no account.
        </p>
        <Uploader {...props} />
        <p className="hero__note">Your drive is analysed and returned — nothing is stored.</p>
      </section>

      <section className="guide" aria-label="How to export">
        <details className="guide__box">
          <summary className="guide__summary">First time? How to export your drive from the Car Scanner app</summary>
          <ol className="guide__steps">
            <li><strong>Before you drive:</strong> in Car Scanner, make sure <strong>Record data</strong> is enabled
              (if it's off, nothing is saved). Turn <strong>Record location</strong> on too, or there'll be no map.
              Leaving <strong>round values off</strong> is best — full precision gives better insights (files are just a little larger).</li>
            <li><strong>Drive</strong> as normal — it records in the background.</li>
            <li>Open <strong>Data recording</strong>, then <strong>long-press a drive</strong> — or tap the
              <strong> ✓</strong> top-right to select several at once.</li>
            <li><strong>Export</strong> and pick a format. <strong>Vertical is recommended</strong> — it's the most
              compatible and compact. <em>Horizontal</em> and <em>Horizontal with fill gaps</em> also work (the latter
              is just bigger). The <strong>.brc</strong> isn't a drive log — it holds your VIN &amp; engine, so add it
              <em> alongside</em> the CSV as the optional vehicle file.</li>
            <li><strong>Save to your device</strong>, then upload the CSV (or several) above — drop the <code>.brc</code>
              in too for your vehicle details.</li>
          </ol>
        </details>
        <details className="guide__box">
          <summary className="guide__summary">Get more out of it — optional sensors to log</summary>
          <p className="guide__intro">
            By default you get the summary, map, eco/cost, and gear views. To also fill in the
            <strong> engine-health</strong> insights, add these sensors to what Car Scanner records
            (same recording profile, full precision). They’re optional — the core report works without them.
          </p>
          <ul className="guide__steps">
            <li><strong>Engine coolant temperature</strong> → <em>warm-up time</em>: how long the engine takes to
              reach operating temperature. Short cold trips are the least efficient and hardest on the engine.</li>
            <li><strong>Battery voltage</strong> — prefer <strong>[ECM] Battery Voltage</strong> (the adapter’s
              “OBD Module Voltage” can read low) → a <em>battery health</em> check.</li>
            <li><strong>Short + Long term fuel trim (Bank 1)</strong> → a <em>rich/lean</em> fuel-mixture flag.</li>
            <li><strong>Boost</strong> (or Intake manifold pressure) → your <em>peak boost</em> reading.</li>
          </ul>
        </details>
      </section>

      <section className="features" aria-label="Features">
        {FEATURES.map((f) => (
          <article className="feature" key={f.title}>
            <div className="feature__icon" aria-hidden="true">{f.icon}</div>
            <h3 className="feature__title">{f.title}</h3>
            <p className="feature__body">{f.body}</p>
          </article>
        ))}
      </section>

      <section className="steps" aria-label="How it works">
        <h2 className="section-head">How it works</h2>
        <div className="steps__grid">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="step__n">{s.n}</div>
              <h3 className="step__title">{s.title}</h3>
              <p className="step__body">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="faq" aria-label="Frequently asked questions">
        <h2 className="section-head">Frequently asked questions</h2>
        <div className="faq__list">
          {FAQ.map((f) => (
            <details className="faq__item" key={f.q}>
              <summary className="faq__q">{f.q}</summary>
              <p className="faq__a">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
