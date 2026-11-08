export function announcementVisible(
  row: {
    status: string;
    isPublik: boolean;
    targetPeran: unknown;
    deletedAt?: Date | null;
    tampilMulai?: Date | null;
    tampilSelesai?: Date | null;
  },
  role?: string,
  now = new Date(),
) {
  return (
    !row.deletedAt &&
    row.status === "terbit" &&
    (!row.tampilMulai || row.tampilMulai <= now) &&
    (!row.tampilSelesai || row.tampilSelesai >= now) &&
    (row.isPublik ||
      Boolean(
        role &&
          Array.isArray(row.targetPeran) &&
          (row.targetPeran.includes(role) ||
            (role === "sekpro" && row.targetPeran.includes("sekprodi"))),
      ))
  );
}
