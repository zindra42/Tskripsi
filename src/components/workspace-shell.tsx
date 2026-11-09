import Link from "next/link";
import { LogoutForm, RoleForm } from "./auth-forms";
import { SessionActivity } from "./session-activity";
import type { AuthenticatedSession } from "@/lib/auth/session";
import { availableRoles, roleLabels } from "@/lib/auth/policy";
import { canManage } from "@/lib/accounts/policy";

function NavButton({
  href,
  icon,
  children,
  badge,
}: {
  href: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-[13px] font-medium text-slate-600 transition-all duration-150 hover:border-slate-200 hover:bg-white hover:text-[#14213d] hover:shadow-xs active:scale-[0.98]"
    >
      {icon && <span className="shrink-0 text-slate-400 transition-colors group-hover:text-slate-500">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {badge && (
        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {badge}
        </span>
      )}
    </Link>
  );
}

function NavSectionDivider({ label }: { label: string }) {
  return (
    <p className="mt-4 mb-1 px-2.5 text-[10px] font-bold tracking-widest text-slate-400 uppercase">{label}</p>
  );
}

export function WorkspaceShell({ session, children }: {
  session: AuthenticatedSession;
  children: React.ReactNode;
}) {
  const roles = availableRoles(session.user);
  const working = session.user.statusAkun === "aktif" && !session.user.wajibGantiPassword;
  return <div className="min-h-screen">
    <SessionActivity key={session.publicId} remember={session.remember} sessionId={session.publicId} />
    <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-5 py-3 shadow-xs backdrop-blur-sm sm:px-8">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#14213d] text-sm font-bold text-[#fca311]" aria-hidden="true">S</span>
        <div><p className="text-sm font-bold tracking-wide leading-none text-[#14213d]">SIAS</p><p className="text-[10px] text-slate-400 leading-none mt-0.5">Akademik Skripsi</p></div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block"><p className="text-sm font-semibold text-[#14213d] leading-tight">{session.user.nama}</p><p className="text-xs text-slate-500 leading-tight">{roleLabels[session.activeRole]}</p></div>
        <LogoutForm />
      </div>
    </header>
    <div className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-8 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-4">
        <nav aria-label="Navigasi utama" className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-xs">
          <p className="section-label px-2 pb-2">Area Kerja</p>
          {working ? <>
            {/* Navigasi Utama */}
            <NavButton
              href={`/dashboard/${session.activeRole}`}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              }
            >
              Dashboard
            </NavButton>
            <NavButton
              href="/ganti-password"
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              }
            >
              Ganti password
            </NavButton>
            <NavButton
              href="/profil"
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
            >
              Profil saya
            </NavButton>

            {/* Skripsi & Judul */}
            {((session.user.role === "mahasiswa" || session.user.role === "admin_keuangan" || session.user.role === "superadmin") || session.user.role !== "dekan") && (
              <NavSectionDivider label="Akademik & Skripsi" />
            )}
            {(session.user.role === "mahasiswa" || session.user.role === "admin_keuangan" || session.user.role === "superadmin") && (
              <NavButton
                href="/administrasi"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
              >
                Administrasi skripsi
              </NavButton>
            )}
            {session.user.role !== "dekan" && <>
              <NavButton
                href="/judul"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                }
              >
                Pengajuan dan review judul
              </NavButton>
              <NavButton
                href="/arsip-judul"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                }
              >
                Arsip judul terdahulu
              </NavButton>
              <NavButton
                href="/bimbingan"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
              >
                Bimbingan dan logbook
              </NavButton>

              {/* Seminar Proposal */}
              <NavSectionDivider label="Seminar Proposal" />
              {session.user.dosen && ["dosen", "kaprodi", "sekpro"].includes(session.user.role) && (
                <NavButton
                  href="/sempro/revisi"
                  icon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  }
                >
                  Review revisi sempro
                </NavButton>
              )}
              {session.user.role === "mahasiswa" && <>
                <NavButton
                  href="/sempro/pendaftaran"
                  icon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                >
                  Pendaftaran seminar proposal
                </NavButton>
                <NavButton
                  href="/sempro/status"
                  icon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  }
                >
                  Status & revisi sempro
                </NavButton>
              </>}
              {["dosen", "kaprodi", "sekpro"].includes(session.activeRole) && (
                <NavButton
                  href="/sempro/konfirmasi-jadwal"
                  icon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                >
                  Konfirmasi & nilai sempro
                </NavButton>
              )}
              <NavButton
                href="/sempro/kehadiran"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                }
              >
                Kehadiran seminar proposal
              </NavButton>
              {canManage(session.user, session.activeRole) && <>
                <NavButton
                  href="/sempro/verifikasi"
                  icon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  }
                >
                  Verifikasi berkas sempro
                </NavButton>
                <NavButton
                  href="/sempro/jadwal"
                  icon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  }
                >
                  Jadwal sempro & penguji
                </NavButton>
                <NavButton
                  href="/sempro/hasil"
                  icon={
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  }
                >
                  Hasil kelulusan sempro
                </NavButton>
              </>}
            </>}

            {/* Sidang & Komunikasi */}
            <NavSectionDivider label="Sidang & Komunikasi" />
            <NavButton
              href="/notifikasi"
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            >
              Notifikasi
            </NavButton>
            {(session.user.role === "mahasiswa" || session.user.role === "superadmin" || (session.user.dosen && ["dosen", "kaprodi", "sekpro"].includes(session.user.role))) && (
              <NavButton
                href="/sidang"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                  </svg>
                }
              >
                Sidang dan revisi akhir
              </NavButton>
            )}
            <NavButton
              href="/pengumuman"
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                </svg>
              }
            >
              Pengumuman
            </NavButton>

            {/* Tata Kelola & Sistem */}
            {(["dekan", "superadmin"].includes(session.user.role) || session.user.role === "superadmin" || canManage(session.user, session.activeRole)) && (
              <NavSectionDivider label="Tata Kelola & Admin" />
            )}
            {["dekan", "superadmin"].includes(session.user.role) && <>
              <NavButton
                href="/organisasi"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                }
              >
                Tata kelola fakultas / prodi
              </NavButton>
              <NavButton
                href="/monitoring"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                }
              >
                Monitoring fakultas
              </NavButton>
            </>}
            {session.user.role === "superadmin" && <>
              <NavButton
                href="/koreksi-proses"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
              >
                Koreksi proses
              </NavButton>
              <NavButton
                href="/audit"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
              >
                Audit aktivitas
              </NavButton>
            </>}
            {canManage(session.user, session.activeRole) && <>
              <NavButton
                href="/akun"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                }
              >
                Kelola dan setujui akun
              </NavButton>
              <NavButton
                href="/akun/permohonan"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                }
              >
                Permohonan akun
              </NavButton>
            </>}
            {canManage(session.user, session.activeRole, "settings") && (
              <NavButton
                href="/pengaturan"
                icon={
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                }
              >
                Pengaturan sistem
              </NavButton>
            )}
          </> : <p className="text-sm text-slate-500">Lengkapi persyaratan akun untuk membuka area kerja.</p>}
        </nav>
        {working && roles.length > 1 && <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs"><RoleForm roles={roles} activeRole={session.activeRole} /></section>}
        <p className="px-1 text-[11px] leading-relaxed text-slate-400">SIAS · TypeScript edition</p>
      </aside>
      <main id="konten" className="min-w-0">{children}</main>
    </div>
  </div>;
}
