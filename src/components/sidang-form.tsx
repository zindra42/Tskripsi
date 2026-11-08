"use client";

import type { ReactNode } from "react";
import { sidangAction, type SidangFormState } from "@/app/actions/sidang";
import { ActionForm } from "@/components/action-form";

export interface SidangFormProps {
  command: string;
  values?: Record<string, string>;
  label: string;
  children?: ReactNode;
  className?: string;
}

export function SidangForm({
  command,
  values = {},
  label,
  children,
  className,
}: SidangFormProps) {
  return (
    <ActionForm
      action={sidangAction}
      command={command}
      values={values}
      label={label}
      successLink={(id) => ({
        href: `/sidang/${id}`,
        label: "Buka pendaftaran sidang",
      })}
      className={className}
    >
      {children}
    </ActionForm>
  );
}

export type { SidangFormState };
