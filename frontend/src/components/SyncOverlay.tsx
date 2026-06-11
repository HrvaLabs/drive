import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { genCode } from '../sync/protocol';
import { startSync, type StartSync, type SyncSession } from '../sync/session';

interface Props {
  onClose: () => void;
  onSynced: () => void;
  initialCode?: string; // from the #sync= deep link (QR scan)
  start?: StartSync;    // injectable for tests
}

// Device-to-device sync: one device shows the code (QR), the other joins.
// History travels directly between the browsers, end-to-end encrypted; the
// server only relays the handshake and stores nothing.
export default function SyncOverlay({ onClose, onSynced, initialCode, start = startSync }: Props) {
  const [mode, setMode] = useState<'idle' | 'host' | 'join'>(initialCode ? 'join' : 'idle');
  const [code, setCode] = useState(initialCode ?? '');
  const [joinInput, setJoinInput] = useState(initialCode ?? '');
  const [status, setStatus] = useState('');
  const [done, setDone] = useState(false);
  const session = useRef<SyncSession | null>(null);

  const events = {
    onStatus: setStatus,
    onProgress: (got: number, all: number) => setStatus(`receiving… ${got}/${all}`),
    onMerged: (msg: string) => { setStatus(msg); setDone(true); onSynced(); },
    onError: (msg: string) => setStatus(`✗ ${msg}`),
  };

  const host = () => {
    const c = genCode();
    setCode(c);
    setMode('host');
    session.current = start('host', c, events);
  };
  const join = (c: string) => {
    const clean = c.trim().toUpperCase();
    if (!clean) return;
    setCode(clean);
    setMode('join');
    session.current = start('join', clean, events);
  };

  useEffect(() => {
    if (initialCode) join(initialCode);
    return () => session.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qrUrl = (() => {
    if (mode !== 'host' || !code) return null;
    const qr = qrcode(0, 'M');
    qr.addData(`${location.origin}/#sync=${code}`);
    qr.make();
    return qr.createDataURL(6, 8); // plain <img>, no innerHTML
  })();

  return (
    <div className="overlay no-print" role="dialog" aria-modal="true" aria-label="Sync devices"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="overlay__panel">
        <button className="overlay__close" aria-label="Close sync" onClick={onClose}>×</button>
        <h2 className="section-title">Sync devices</h2>
        <p className="muted">Your history moves <strong>directly between your devices</strong>, end-to-end
          encrypted — the server only relays the handshake and stores nothing. Both devices need the
          app open (same Wi-Fi is most reliable). A public STUN server helps them find each other —
          it sees your IP to set up the link, never your data. Merging never deletes anything.</p>

        {mode === 'idle' && (
          <div className="sync-actions">
            <button className="btn" onClick={host}>Show code on this device</button>
            <span className="muted">or</span>
            <input aria-label="sync code" placeholder="code from the other device" value={joinInput}
                   onChange={(e) => setJoinInput(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') join(joinInput); }} />
            <button className="btn" onClick={() => join(joinInput)}>Join</button>
          </div>
        )}

        {mode === 'host' && qrUrl && (
          <div className="sync-host">
            <img className="sync-qr" src={qrUrl} alt={`Sync QR code ${code}`} />
            <p>Scan with the other device, or type the code there: <code>{code}</code></p>
          </div>
        )}

        {status && <p className={done ? 'sync-status sync-status--ok' : 'sync-status'} role="status">{status}</p>}
        {done && <button className="btn" onClick={onClose}>Done</button>}
      </div>
    </div>
  );
}
