import { useState } from 'react';
import type { DriveMeta } from '../history/types';
import { updateDriveMeta } from '../history/db';
import { fmtDriveDateTime } from '../time';
import { isParkedLog } from '../history/quality';

interface Props {
  drive: DriveMeta;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
  checked?: boolean;
  onToggle?: (id: string) => void;
}

export default function DriveRow({ drive, onOpen, onDelete, onChanged, checked, onToggle }: Props) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(drive.tags ?? []);
  const [note, setNote] = useState<string>(drive.notes ?? '');
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ');
    setDraft('');
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const save = async () => {
    await updateDriveMeta(drive.id, { tags, notes: note.trim() });
    setEditing(false);
    onChanged();
  };
  const cancel = () => {
    setTags(drive.tags ?? []);
    setNote(drive.notes ?? '');
    setDraft('');
    setEditing(false);
  };

  return (
    <div className="drive-row">
      {onToggle && (
        <input type="checkbox" className="drive-row__check" aria-label={`select ${drive.label}`}
               checked={!!checked} onChange={() => onToggle(drive.id)} />
      )}
      <div className="drive-row__main">
        <span className="drive-row__date">{fmtDriveDateTime(drive.driveDate, drive.savedAt, drive.startedAtClock)}</span>
        <span className="drive-row__label" title={drive.label}>{drive.label}</span>
        <span className="drive-row__stat">{drive.distanceKm.toFixed(1)} km</span>
        <span className="drive-row__stat">{drive.costEur > 0 ? `€${drive.costEur.toFixed(2)}` : '—'}</span>
        <span className="drive-row__stat">{drive.l100km > 0 ? `${drive.l100km.toFixed(1)} L/100km` : '—'}</span>
        <span className="drive-row__stat">eco {drive.eco}</span>
        {isParkedLog(drive) && (
          <span className="drive-row__flag">
            <span className="tag tag--parked" title="This recording never really moved — a diagnostic or idle-only session, not a real drive.">parked log · not a real drive</span>
          </span>
        )}

        {!editing && ((drive.tags?.length ?? 0) > 0 || drive.notes) && (
          <span className="drive-row__meta">
            {(drive.tags ?? []).map((t) => <span className="tag" key={t}>{t}</span>)}
            {drive.notes && <span className="drive-row__note">{drive.notes}</span>}
          </span>
        )}

        {editing && (
          <div className="drive-row__editor">
            <div className="tag-input">
              {tags.map((t) => (
                <span className="tag tag--editable" key={t}>{t}
                  <button className="tag__x" aria-label={`remove tag ${t}`} onClick={() => removeTag(t)}>×</button>
                </span>
              ))}
              <input aria-label="add tag" placeholder="add tag…" value={draft}
                     onChange={(e) => setDraft(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(draft); } }} />
            </div>
            <textarea aria-label="note" className="note-input" rows={2} placeholder="note…"
                      value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </div>

      <div className="drive-row__actions">
        {editing ? (
          <>
            <button className="pill" onClick={save}>Save</button>
            <button className="pill" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <>
            <button className="pill" onClick={() => setEditing(true)}>Edit</button>
            <button className="pill" onClick={() => onOpen(drive.id)}>Open</button>
            <button className="pill" onClick={() => onDelete(drive.id)}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}
