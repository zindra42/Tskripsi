"use client";

import Link from "next/link";
import { useActionState, useRef, type ReactNode } from "react";

export type ActionFormState = {
  error?: string;
  success?: string;
  id?: string;
};

export type FormAction = (
  previous: ActionFormState,
  formData: FormData,
) => Promise<ActionFormState>;

export interface ActionFormProps {
  action: FormAction;
  command: string;
  values?: Record<string, string>;
  label: string;
  children?: ReactNode;
  successLink?: (id: string) => { href: string; label: string };
  className?: string;
}

export function ActionForm({
  action: formAction,
  command,
  values = {},
  label,
  children,
  successLink,
  className = "space-y-4",
}: ActionFormProps) {
  const key = useRef<string | null>(null);
  const [state, action, pending] = useActionState<ActionFormState, FormData>(
    async (previous, form) => {
      key.current ??= crypto.randomUUID();
      form.set("key", key.current);
      const result = await formAction(previous, form);
      if (result.success) key.current = null;
      return result;
    },
    {},
  );

  const link = state.id && successLink ? successLink(state.id) : null;

  return (
    <form action={action} className={className}>
      <input type="hidden" name="command" value={command} />
      {Object.entries(values).map(([name, value]) => (
        <input type="hidden" key={name} name={name} value={value} />
      ))}
      <fieldset disabled={pending} className="space-y-4">
        {children}
      </fieldset>
      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-emerald-900"
        >
          {state.success}
        </p>
      )}
      {link && (
        <Link href={link.href} className="block underline">
          {link.label}
        </Link>
      )}
      <button className="button" disabled={pending}>
        {pending ? "Menyimpan..." : label}
      </button>
    </form>
  );
}
