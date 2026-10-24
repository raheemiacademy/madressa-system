'use client';

import { useState } from 'react';

type Opt = { value: string; label: string };

/** Choose a class to list its students as checkboxes (named `name`), with "select all". Used to award merits and issue certificates. */
export function PeoplePicker({ name, classes, rosters, legend = 'Students' }: { name: string; classes: Opt[]; rosters: Record<string, Opt[]>; legend?: string }) {
  const [classId, setClassId] = useState(classes[0]?.value ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const kids = rosters[classId] ?? [];
  const allOn = kids.length > 0 && kids.every((k) => picked.includes(k.value));
  return (
    <fieldset className="ra-fieldset ra-field full">
      <legend>{legend}</legend>
      <div className="ra-toolbar">
        <div className="ra-field"><label htmlFor={`${name}-class`}>Class</label>
          <select className="ra-select" id={`${name}-class`} value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
        {kids.length > 0 && <button type="button" className="ra-btn" onClick={() => setPicked(allOn ? picked.filter((p) => !kids.some((k) => k.value === p)) : [...new Set([...picked, ...kids.map((k) => k.value)])])}>{allOn ? 'Clear class' : 'Select whole class'}</button>}
      </div>
      {picked.map((p) => <input key={p} type="hidden" name={name} value={p} />)}
      {kids.length === 0 ? <p className="ra-note" style={{ margin: 0 }}>This class has no students today.</p> : (
        <div className="ra-checks">{kids.map((k) => (
          <label key={k.value} className="ra-check"><input type="checkbox" checked={picked.includes(k.value)} onChange={() => setPicked(picked.includes(k.value) ? picked.filter((p) => p !== k.value) : [...picked, k.value])} /><span>{k.label}</span></label>
        ))}</div>
      )}
      <p className="ra-note" style={{ margin: 0 }} aria-live="polite">{picked.length === 1 ? '1 student chosen' : `${picked.length} students chosen`}</p>
    </fieldset>
  );
}
