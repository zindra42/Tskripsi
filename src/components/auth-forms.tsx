"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changePassword, login, logout, switchRole } from "@/app/actions/auth";
import type { Role } from "@/generated/prisma/enums";
import { roleLabels } from "@/lib/auth/policy";

function FormError({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{message}</p> : null;
}

export function LoginForm() {
  const [state, action, pending] = useActionState(login, { error: "" });
  return <form action={action} className="space-y-5">
    <FormError message={state.error} />
    <div>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="username" required maxLength={255} placeholder="nama@uts.ac.id" />
    </div>
    <div>
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={1024} />
    </div>
    <label className="flex items-center gap-3 text-sm font-normal">
      <input type="checkbox" name="remember" className="h-4 w-4 accent-[#14213d]" />
      Ingat saya selama 7 hari
    </label>
    <button type="submit" disabled={pending} className="button w-full">{pending ? "Memeriksa akun…" : "Masuk"}</button>
    <div className="flex flex-wrap justify-between gap-4 text-sm"><Link href="/register" className="underline">Daftar akun</Link><Link href="/lupa-password" className="underline">Lupa password</Link></div>
  </form>;
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, { error: "" });
  return <form action={action} className="max-w-md space-y-5">
    <FormError message={state.error} />
    <div>
      <label htmlFor="currentPassword">Password saat ini</label>
      <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required maxLength={1024} />
    </div>
    <div>
      <label htmlFor="newPassword">Password baru</label>
      <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} aria-describedby="password-help" />
      <p id="password-help" className="mt-2 text-sm text-slate-600">Minimal 8 karakter, maksimal 72 byte UTF-8. Gunakan password yang berbeda dari sebelumnya.</p>
    </div>
    <div>
      <label htmlFor="confirmation">Konfirmasi password baru</label>
      <input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
    </div>
    <button type="submit" disabled={pending} className="button">{pending ? "Menyimpan…" : "Simpan password"}</button>
  </form>;
}

export function LogoutForm() {
  const [state, action, pending] = useActionState(logout, { error: "" });
  return <form action={action} className="space-y-2">
    <button type="submit" disabled={pending} className="button-secondary">{pending ? "Keluar…" : "Keluar"}</button>
    <FormError message={state.error} />
  </form>;
}

export function RoleForm({ roles, activeRole }: { roles: Role[]; activeRole: Role }) {
  const [state, action, pending] = useActionState(switchRole, { error: "" });
  return <form action={action} className="space-y-3">
    <label htmlFor="role">Area kerja</label>
    <select id="role" name="role" defaultValue={activeRole}>
      {roles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
    </select>
    <button type="submit" disabled={pending} className="button-secondary w-full">{pending ? "Beralih…" : "Beralih peran"}</button>
    <FormError message={state.error} />
  </form>;
}
