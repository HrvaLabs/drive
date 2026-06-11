import { useEffect, useState } from 'react';
import {
  isAutoBackupSupported, linkBackupFile, linkedBackupName, requestBackupPermission, unlinkBackupFile,
} from '../history/autoBackup';

interface Props {
  onClose: () => void;
  onClearAll: () => void;
  onBackup: () => void;
  onRestore: (file: File) => Promise<string>;
}

// Full-screen privacy notice. The in-app, friendly version of PRIVACY.md — grounded
// in how the app actually handles data (stateless server, on-device history, OSM map).
export default function PrivacyOverlay({ onClose, onClearAll, onBackup, onRestore }: Props) {
  const [restoreMsg, setRestoreMsg] = useState('');
  const [linkedName, setLinkedName] = useState<string | null>(null);
  useEffect(() => { linkedBackupName().then(setLinkedName).catch(() => {}); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay no-print" role="dialog" aria-modal="true" aria-label="Privacy notice"
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="overlay__panel">
        <button className="overlay__close" aria-label="Close privacy notice" onClick={onClose}>×</button>
        <h2 className="section-title">Privacy</h2>
        <p className="muted">HrvaDrive is a non-commercial hobby project, provided “as is”.</p>
        <ul className="privacy-list">
          <li><strong>No accounts, no cookies, no tracking, no analytics.</strong></li>
          <li><strong>The server is stateless.</strong> Your uploaded drive log — which can contain your
            vehicle’s VIN and GPS location — is processed in memory to build the report and is
            <strong> not stored</strong>.</li>
          <li><strong>Your history stays in your browser</strong> (IndexedDB) and never leaves your
            device. Remove any drive with <em>Delete</em> in the History tab, or wipe everything with
            the button below.</li>
          <li>Your optional fuel price is remembered only in your browser (localStorage).</li>
          <li><strong>Named places</strong> you create ("Home", "Work") stay in your browser too —
            drives are matched against them on your device, never on a server.</li>
          <li>The <strong>map</strong> loads tiles from <strong>OpenStreetMap</strong>, which receives
            your IP address and the map area of your drive while the map is shown. Fonts are
            self-hosted — nothing is requested from Google.</li>
          <li><strong>"Decode VIN" is optional</strong> — pressing it sends that car's VIN to NHTSA (US gov) to look up make/model; it's the only time a VIN leaves your device.</li>
          <li><strong>Device sync is direct and end-to-end encrypted</strong> — your history travels
            browser-to-browser; the server only relays the connection handshake while both devices
            are open and stores nothing. To help the two browsers find each other it uses a public
            <strong> STUN</strong> server, which sees your IP address (to set up the link) but never
            your data.</li>
          <li>No other external services are contacted.</li>
        </ul>
        <h3 className="section-title">Terms of use</h3>
        <ul className="privacy-list">
          <li><strong>Free hobby service, "as is"</strong> — no warranty, and it may change or stop at
            any time. Keep a backup (button below) if your history matters to you.</li>
          <li><strong>Reports are estimates</strong> from your log — not professional automotive,
            financial or safety advice. Verify with a mechanic before acting on a health hint, and
            never read a report while driving.</li>
          <li>Upload only drive logs you're entitled to use; your data stays yours.</li>
        </ul>
        <div className="backup-row">
          <button className="btn" onClick={onBackup}>Download backup</button>
          <label className="btn">
            Restore backup
            <input type="file" aria-label="restore backup file" accept=".json" style={{ display: 'none' }}
                   onChange={(e) => {
                     const f = e.target.files?.[0];
                     e.currentTarget.value = '';
                     if (f) onRestore(f).then(setRestoreMsg, (err: unknown) =>
                       setRestoreMsg(err instanceof Error ? err.message : String(err)));
                   }} />
          </label>
          <span className="muted" role="status">{restoreMsg || 'Your history lives only in this browser — keep a backup file.'}</span>
        </div>
        {isAutoBackupSupported() && (
          <div className="backup-row">
            {linkedName ? (
              <>
                <button className="btn" onClick={() => unlinkBackupFile().then(() => setLinkedName(null))}>Unlink auto-backup</button>
                <button className="btn" onClick={() => { requestBackupPermission().then((r) => setRestoreMsg(r === 'written' ? `Auto-backup saved to ${linkedName}.` : 'Auto-backup needs permission — try again.')); }}>Save now</button>
                <span className="muted">Auto-saving to <code>{linkedName}</code> after every change — put it in a folder your cloud syncs.</span>
              </>
            ) : (
              <>
                <button className="btn" onClick={() => linkBackupFile().then((n) => { if (n) { setLinkedName(n); setRestoreMsg(`Auto-backup linked to ${n}.`); } })}>Auto-save to file…</button>
                <span className="muted">Pick a file in your cloud-synced folder (Drive, iCloud, Syncthing) — the fallback sync when devices can't connect directly.</span>
              </>
            )}
          </div>
        )}
        <div className="danger-zone">
          <button className="btn btn--danger"
                  onClick={() => {
                    if (window.confirm('Delete ALL drives, cars and settings stored in this browser? This cannot be undone.')) {
                      onClearAll();
                    }
                  }}>
            Delete all data
          </button>
          <span className="muted">Wipes every saved drive, car and setting from this browser.</span>
        </div>
        <p className="muted">
          Provided as-is with no warranty. If you run your own instance, you are responsible for it and
          any data it handles. Operated by <a href="https://hrvalabs.net" target="_blank"
          rel="noreferrer noopener">HrvaLabs</a>.
        </p>
      </div>
    </div>
  );
}
