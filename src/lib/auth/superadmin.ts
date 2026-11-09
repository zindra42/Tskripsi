import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hashPassword, verifyPassword } from "./password";

export type SuperadminEnvConfig = {
  nama: string;
  email: string;
  password: string;
};

export function getSuperadminEnvConfig(): SuperadminEnvConfig | null {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();
  if (!email || !password) return null;
  const nama = process.env.SUPERADMIN_NAME?.trim() || "Super Administrator";
  return { nama, email, password };
}

export function isSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const config = getSuperadminEnvConfig();
  if (!config) return false;
  return email.trim().toLowerCase() === config.email;
}

type DbOrTx = Pick<PrismaClient, "pengguna">;

export async function ensureSuperadmin(dbOrTx: DbOrTx) {
  const config = getSuperadminEnvConfig();
  if (!config) return null;

  // Single-superadmin invariant: role "superadmin" can only exist once
  const existingSuperadmins = await dbOrTx.pengguna.findMany({
    where: { role: "superadmin" },
  });

  const matchingByEmail = await dbOrTx.pengguna.findUnique({
    where: { email: config.email },
  });

  let targetId: bigint | null = null;
  if (matchingByEmail) {
    targetId = matchingByEmail.id;
  } else if (existingSuperadmins.length > 0) {
    targetId = existingSuperadmins[0].id;
  }

  // Deactivate any duplicate superadmin accounts to preserve single-superadmin invariant
  if (existingSuperadmins.length > 0) {
    for (const admin of existingSuperadmins) {
      if (targetId && admin.id !== targetId) {
        await dbOrTx.pengguna.update({
          where: { id: admin.id },
          data: { statusAkun: "nonaktif", deletedAt: new Date() },
        });
      }
    }
  }

  if (targetId) {
    const current = await dbOrTx.pengguna.findUnique({ where: { id: targetId } });
    if (!current) return null;

    const passwordMatches = await verifyPassword(config.password, current.password);
    const updateData: Prisma.PenggunaUpdateInput = {
      nama: config.nama,
      email: config.email,
      emailArsip: null,
      role: "superadmin",
      statusAkun: "aktif",
      catatanPenolakan: null,
      dibuatOlehSuperAdmin: true,
      wajibGantiPassword: false,
      deletedAt: null,
      updatedAt: new Date(),
    };
    if (!passwordMatches) {
      updateData.password = await hashPassword(config.password);
      updateData.authVersion = { increment: 1 };
    }
    return await dbOrTx.pengguna.update({
      where: { id: targetId },
      data: updateData,
    });
  }

  const hashedPassword = await hashPassword(config.password);
  const now = new Date();
  return await dbOrTx.pengguna.create({
    data: {
      nama: config.nama,
      email: config.email,
      password: hashedPassword,
      role: "superadmin",
      statusAkun: "aktif",
      dibuatOlehSuperAdmin: true,
      wajibGantiPassword: false,
      createdAt: now,
      updatedAt: now,
    },
  });
}
