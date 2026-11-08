import "server-only";
import type { Tx } from "@/lib/accounts/store";

export const ROMAN_MONTHS: Record<number, string> = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
  11: "XI",
  12: "XII",
};

export function getBulanRomawi(date: Date): string {
  const month = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Makassar",
      month: "numeric",
    }).format(date),
  );
  return ROMAN_MONTHS[month] ?? "I";
}

export function formatNomorUrut(nomor: number): string {
  return String(nomor).padStart(3, "0");
}

export function generateNomorSurat(
  urut: number,
  kategori: string,
  bulanRomawi: string,
  tahun: number,
): string {
  return `${formatNomorUrut(urut)}-${kategori}/UTS/FRS-INF/TA/${bulanRomawi}/${tahun}`;
}

export async function getOrCreateNomorDasar(tx: Tx, pengajuanId: bigint) {
  let nomorDasar = await tx.nomorSuratDasar.findUnique({
    where: { idPengajuan: pengajuanId },
  });
  if (!nomorDasar) {
    const currentYear = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Makassar",
        year: "numeric",
      }).format(new Date()),
    );
    // Imported allocations may be sparse. Counting rows would reuse an existing number.
    const lastAllocation = await tx.nomorSuratDasar.findFirst({
      where: { tahun: currentYear },
      orderBy: { nomorUrut: "desc" },
    });
    const nextUrut = (lastAllocation?.nomorUrut ?? 0) + 1;

    nomorDasar = await tx.nomorSuratDasar.create({
      data: {
        idPengajuan: pengajuanId,
        tahun: currentYear,
        nomorUrut: nextUrut,
        tanggalAlokasi: new Date(),
      },
    });
  }
  return nomorDasar;
}

export async function getOrCreateNomorDokumen(
  tx: Tx,
  nomorDasarId: bigint,
  kategori: string,
  tanggalTerbit: Date = new Date(),
) {
  let kategoriRecord = await tx.nomorSuratKategori.findUnique({
    where: {
      idNomorDasar_kategori: {
        idNomorDasar: nomorDasarId,
        kategori,
      },
    },
  });

  if (!kategoriRecord) {
    const nomorDasar = await tx.nomorSuratDasar.findUniqueOrThrow({
      where: { id: nomorDasarId },
    });
    const romawi = getBulanRomawi(tanggalTerbit);
    const tahun = Number(
      new Intl.DateTimeFormat("en", {
        timeZone: "Asia/Makassar",
        year: "numeric",
      }).format(tanggalTerbit),
    );
    const nomorLengkap = generateNomorSurat(
      nomorDasar.nomorUrut,
      kategori,
      romawi,
      tahun,
    );

    kategoriRecord = await tx.nomorSuratKategori.create({
      data: {
        idNomorDasar: nomorDasar.id,
        kategori,
        nomorLengkap,
        bulanRomawi: romawi,
        tahun,
        tanggalTerbit,
      },
    });
  }

  return kategoriRecord;
}
