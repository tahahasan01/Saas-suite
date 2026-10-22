"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useAction";

/** The employee's own choice whether the team sees their birthday (wave A, H20). */
export function BirthdaySwitch({ initial, hasDate }: { initial: boolean; hasDate: boolean }) {
  const [on, setOn] = useState(initial);
  const save = useAction(
    (v: boolean) => api("/me/celebrations/settings", { method: "PUT", body: JSON.stringify({ celebrate_birthday: v }) }),
    { failure: "Couldn't save that" },
  );
  if (!hasDate) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-fg-muted">
      <input type="checkbox" checked={on} disabled={save.busy}
             onChange={async (e) => { const v = e.target.checked; setOn(v); if ((await save.run(v)) === undefined) setOn(!v); }} />
      Let the team see my birthday (the year is never shown)
    </label>
  );
}
