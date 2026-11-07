"use client";
import Link from "next/link";
import { useActionState, useRef } from "react";
import { sidangAction, type SidangFormState } from "@/app/actions/sidang";

export function SidangForm({ command, values = {}, label, children }: { command: string;
  values?: Record<string, string>; label: string; children?: React.ReactNode }) {
  const key = useRef<string | null>(null);
  const [state, action, pending] = useActionState<SidangFormState, FormData>(async (previous, form) => {
    key.current ??= crypto.randomUUID();
    form.set("key", key.current);
    const result = await sidangAction(previous, form);
    if (result.success) key.current = null;
    return result;
  }, {});
  return <form action={action} className="space-y-4">
    <input type="hidden" name="command" value={command} />
    {Object.entries(values).map(([name, value]) => <input type="hidden" key={name} name={name} value={value} />)}
    <fieldset disabled={pending} className="space-y-4">{children}</fieldset>
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{state.error}</p>}
    {state.success && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{state.success}</p>}
    {state.id && <Link href={`/sidang/${state.id}`} className="block underline">Buka pendaftaran sidang</Link>}
    <button className="button" disabled={pending}>{pending ? "Menyimpan..." : label}</button>
  </form>;
}
