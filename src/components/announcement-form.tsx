"use client";

import type { ReactNode } from "react";
import { announcementAction } from "@/app/actions/announcements";
import { ActionForm } from "@/components/action-form";

export interface AnnouncementFormProps {
  command: string;
  values?: Record<string, string>;
  label: string;
  children?: ReactNode;
  successLink?: (id: string) => { href: string; label: string };
  className?: string;
}

export function AnnouncementForm({
  command,
  values = {},
  label,
  children,
  successLink,
  className,
}: AnnouncementFormProps) {
  return (
    <ActionForm
      action={announcementAction}
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
