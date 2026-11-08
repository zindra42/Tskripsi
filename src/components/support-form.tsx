"use client";

import type { ReactNode } from "react";
import { supportAction } from "@/app/actions/support";
import { ActionForm } from "@/components/action-form";

export interface SupportFormProps {
  command: string;
  values?: Record<string, string>;
  label: string;
  children?: ReactNode;
  successLink?: (id: string) => { href: string; label: string };
  className?: string;
}

export function SupportForm({
  command,
  values = {},
  label,
  children,
  successLink,
  className,
}: SupportFormProps) {
  return (
    <ActionForm
      action={supportAction}
      command={command}
      values={values}
      label={label}
      successLink={successLink}
      className={className}
    >
      {children}
    </ActionForm>
  );
}
