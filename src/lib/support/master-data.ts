import "server-only";
import { cache } from "react";
import { database } from "@/lib/db";
import { settingsValues } from "@/lib/accounts/store";
import { activeGuidanceWhere } from "@/lib/academic/store";

/**
 * Memoized system settings query.
 * Cached per server request lifecycle via React cache().
 */
export const getCachedSystemSettings = cache(async () => {
  return settingsValues(database());
});

/**
 * Memoized active lecturers query (full fields for examiner/supervisor assignment).
 * Filters for users with role in ["dosen", "kaprodi", "sekpro"], active status,
 * not soft-deleted, and with an active lecturer profile.
 */
export const getCachedActiveLecturers = cache(async () => {
  return database().pengguna.findMany({
    where: {
      role: { in: ["dosen", "kaprodi", "sekpro"] },
      statusAkun: "aktif",
      deletedAt: null,
      dosen: { isNot: null },
    },
    select: {
      id: true,
      nama: true,
      email: true,
      dosen: { select: { nidn: true, kuotaBimbingan: true } },
    },
    orderBy: { nama: "asc" },
  });
});

/**
 * Memoized active lecturers with supervision counts for management overview monitoring.
 */
export const getCachedActiveLecturersWithSupervisions = cache(async () => {
  return database().pengguna.findMany({
    where: {
      role: { in: ["dosen", "kaprodi", "sekpro"] },
      statusAkun: "aktif",
      deletedAt: null,
      dosen: { isNot: null },
    },
    select: {
      id: true,
      nama: true,
      dosen: true,
      _count: {
        select: {
          primarySupervisions: { where: activeGuidanceWhere },
          secondarySupervisions: { where: activeGuidanceWhere },
        },
      },
    },
    orderBy: { nama: "asc" },
  });
});

/**
 * Memoized lightweight lecturer options for select dropdowns.
 */
export const getCachedLecturerOptions = cache(async () => {
  return database().pengguna.findMany({
    where: {
      role: { in: ["dosen", "kaprodi", "sekpro"] },
      statusAkun: "aktif",
      deletedAt: null,
      dosen: { isNot: null },
    },
    select: {
      id: true,
      nama: true,
    },
    orderBy: { nama: "asc" },
  });
});

/**
 * Memoized master study fields (bidang keahlian).
 */
export const getCachedMasterFields = cache(async () => {
  return database().bidangKeahlian.findMany({
    orderBy: { namaBidang: "asc" },
  });
});
