import "server-only";
import { audit } from "@/lib/accounts/store";
import { requireManager, notify, type Context } from "@/lib/academic/store";
import { witaToday } from "./policy";

// Same H-7/H-3/H-1 contract as SidangPengingatCommand. Invoke inside the shared
// transaction so the audit marker and in-app notification commit together.
export async function processReminders(context: Context) {
  requireManager(context);
  const today = new Date(witaToday()).getTime();
  const schedules = await context.tx.jadwalSidang.findMany({ where: { status: { in: ["menunggu_konfirmasi", "final"] },
    statusPelaksanaan: { notIn: ["dibatalkan", "tidak_terlaksana", "selesai"] }, tanggal: { not: null } },
    include: { konfirmasiList: true, sidang: { include: { pengajuan: true } } } });
  let sent = 0;
  for (const j of schedules) {
    const days = Math.round((j.tanggal!.getTime() - today) / 86400000);
    if (![7, 3, 1].includes(days)) continue;
    const confirmations = j.konfirmasiList.filter((c) => c.versi === j.versi && c.status === (j.status === "final" ? "bersedia" : "menunggu"));
    const recipients = [...confirmations.map((c) => c.dosenId), ...(j.status === "final" ? [j.sidang.pengajuan.idMahasiswa] : [])];
    for (const id of new Set(recipients)) {
      const entity = `sidang:${j.id}:v${j.versi}:${j.tanggal!.toISOString().slice(0, 10)}:h${days}:user:${id}`;
      if (await context.tx.logAktivitas.findFirst({ where: { aksi: "pengingat_sidang_berkala", entitasTerkait: entity } })) continue;
      const active = await context.tx.pengguna.findFirst({ where: { id, statusAkun: "aktif", deletedAt: null } });
      if (!active) continue;
      await notify(context.tx, [id], `pengingat_h${days}`, `Pengingat H-${days}: sidang ${j.sidang.pengajuan.judul}, ${j.tanggal!.toISOString().slice(0, 10)} ${j.waktuMulai} WITA di ${j.ruang}.${j.status === "menunggu_konfirmasi" ? " Mohon konfirmasi kesediaan Anda." : ""}`, `/sidang/${j.idSidang}`);
      await audit(context.tx, context.actor.id, "pengingat_sidang_berkala", entity, { recipientId: String(id), days, version: j.versi });
      sent++;
    }
  }
  return { sent };
}
