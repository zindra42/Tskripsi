import assert from "node:assert/strict";
import test from "node:test";
import {
  hitungNilaiKomponen,
  hitungNilaiAkhir,
  konversiPredikat,
  isDisetujuiKaprodi,
  getTargetTierKehadiran,
  isDalamJendelaKehadiran,
  checkTimeOverlap,
  validateSlotRules,
  formatNomorUrut,
  generateNomorSurat,
  getBulanRomawi,
  maskNim,
  SEMPRO_CHECKLIST_DEFINITIONS,
  SUBMIT_REQUIRED_ITEMS,
} from "../src/lib/sempro/policy";
import { generateQrMatrix, generateQrSvg } from "../src/lib/sempro/qr";
import { SimplePdfDocument } from "../src/lib/sempro/pdf";
import {
  renderSuratUndanganPdf,
  renderBeritaAcaraPdf,
} from "../src/lib/sempro/documents";

test("kebijakan sempro: kalkulasi nilai, predikat, dan pembobotan", () => {
  // Test komponen rata-rata
  const komponen = hitungNilaiKomponen(80, 85, 90, 75, 80);
  assert.equal(komponen, 82);

  // Test bobot akhir: 34% P1, 33% P2, 33% Pembimbing
  // 80 * 0.34 + 80 * 0.33 + 80 * 0.33 = 80
  const nilaiAkhir = hitungNilaiAkhir(80, 80, 80);
  assert.equal(nilaiAkhir, 80);

  // Test bobot variatif
  // 90 * 0.34 + 80 * 0.33 + 70 * 0.33 = 30.6 + 26.4 + 23.1 = 80.1
  const nilaiVariatif = hitungNilaiAkhir(90, 80, 70);
  assert.equal(nilaiVariatif, 80.1);

  // Test konversi predikat
  assert.equal(konversiPredikat(85).huruf, "A");
  assert.equal(konversiPredikat(76).huruf, "B+");
  assert.equal(konversiPredikat(71).huruf, "B");
  assert.equal(konversiPredikat(66).huruf, "C+");
  assert.equal(konversiPredikat(61).huruf, "C");
  assert.equal(konversiPredikat(52).huruf, "D");
  assert.equal(konversiPredikat(45).huruf, "E");
});

test("kebijakan sempro: Two-Tier approval predicate kompatibilitas legacy", () => {
  // Status disetujui kaprodi baru
  assert.equal(isDisetujuiKaprodi({ statusPersetujuan: "disetujui_kaprodi", hasil: "lulus" }), true);
  assert.equal(isDisetujuiKaprodi({ statusPersetujuan: "menunggu_persetujuan_kaprodi", hasil: null }), false);
  assert.equal(isDisetujuiKaprodi({ statusPersetujuan: "menunggu_keputusan_penguji_1", hasil: null }), false);

  // Legacy record yang belum memiliki status_persetujuan eksplisit tetapi hasil sudah lulus/lulus_revisi
  assert.equal(isDisetujuiKaprodi({ statusPersetujuan: "menunggu_nilai_lengkap", hasil: "lulus" }), true);
  assert.equal(isDisetujuiKaprodi({ statusPersetujuan: null, hasil: "lulus_revisi" }), true);
  assert.equal(isDisetujuiKaprodi({ statusPersetujuan: null, hasil: "tidak_lulus" }), true);
  assert.equal(isDisetujuiKaprodi({ statusPersetujuan: null, hasil: null }), false);
});

test("kebijakan sempro: tier kehadiran dan formula urutan", () => {
  assert.equal(getTargetTierKehadiran(1), 0);
  assert.equal(getTargetTierKehadiran(2), 0);
  assert.equal(getTargetTierKehadiran(3), 0);
  assert.equal(getTargetTierKehadiran(4), 1);
  assert.equal(getTargetTierKehadiran(7), 1);
  assert.equal(getTargetTierKehadiran(8), 2);
  assert.equal(getTargetTierKehadiran(11), 2);
  assert.equal(getTargetTierKehadiran(12), 3);
  assert.equal(getTargetTierKehadiran(25), 3);
});

test("kebijakan sempro: jendela waktu kehadiran presensi", () => {
  const tanggal = "2026-10-10";
  const mulai = "09:00";
  const selesai = "11:00";

  // Tepat saat mulai (09:00 WITA -> 01:00 UTC)
  const saatMulai = new Date(Date.UTC(2026, 9, 10, 1, 0, 0));
  assert.equal(isDalamJendelaKehadiran(tanggal, mulai, selesai, saatMulai), true);

  // 4 menit sebelum mulai (08:56 WITA -> 00:56 UTC) -> Masuk jendela (H-5)
  const sebelumMulai = new Date(Date.UTC(2026, 9, 10, 0, 56, 0));
  assert.equal(isDalamJendelaKehadiran(tanggal, mulai, selesai, sebelumMulai), true);

  // 6 menit sebelum mulai (08:54 WITA) -> Diluar jendela
  const terlaluCepat = new Date(Date.UTC(2026, 9, 10, 0, 54, 0));
  assert.equal(isDalamJendelaKehadiran(tanggal, mulai, selesai, terlaluCepat), false);

  // 9 menit setelah selesai (11:09 WITA) -> Masuk jendela (H+10)
  const jelangTutup = new Date(Date.UTC(2026, 9, 10, 3, 9, 0));
  assert.equal(isDalamJendelaKehadiran(tanggal, mulai, selesai, jelangTutup), true);

  // 15 menit setelah selesai (11:15 WITA) -> Diluar jendela
  const lewatWaktu = new Date(Date.UTC(2026, 9, 10, 3, 15, 0));
  assert.equal(isDalamJendelaKehadiran(tanggal, mulai, selesai, lewatWaktu), false);
});

test("kebijakan sempro: validasi slot dan deteksi tabrakan waktu", () => {
  // Overlap checker
  assert.equal(checkTimeOverlap("09:00", "11:00", "10:00", "12:00"), true);
  assert.equal(checkTimeOverlap("09:00", "11:00", "11:00", "13:00"), false); // back to back
  assert.equal(checkTimeOverlap("09:00", "11:00", "08:00", "09:00"), false);
  assert.equal(checkTimeOverlap("09:00", "11:00", "09:30", "10:30"), true);

  // Valid slot (Senin, 09:00 - 11:00)
  assert.doesNotThrow(() => validateSlotRules("2026-10-12", "09:00", "11:00"));

  // Akhir pekan ditolak (Sabtu 2026-10-10)
  assert.throws(() => validateSlotRules("2026-10-10", "09:00", "11:00"), /hari kerja/);

  // Diluar jam operasional (07:00 atau 17:00)
  assert.throws(() => validateSlotRules("2026-10-12", "07:00", "09:00"), /08:00 dan 16:00/);
  assert.throws(() => validateSlotRules("2026-10-12", "15:00", "17:00"), /08:00 dan 16:00/);
});

test("kebijakan sempro: penomoran surat, bulan romawi, dan masking identitas", () => {
  assert.equal(formatNomorUrut(1), "001");
  assert.equal(formatNomorUrut(42), "042");
  assert.equal(formatNomorUrut(123), "123");

  const d = new Date(2026, 1, 15); // Februari
  assert.equal(getBulanRomawi(d), "II");

  const nomorUndangan = generateNomorSurat(5, "b", "II", 2026);
  assert.equal(nomorUndangan, "005-b/UTS/FRS-INF/TA/II/2026");

  assert.equal(maskNim("20210001"), "2021****");
  assert.equal(maskNim("123"), "123");
  assert.equal(maskNim(null), "-");

  // Required submit items
  assert.deepEqual(SUBMIT_REQUIRED_ITEMS, [0, 1, 6, 7, 8, 9, 10]);
  assert.equal(SEMPRO_CHECKLIST_DEFINITIONS[0].namaDokumen, "File Proposal Skripsi");
  assert.equal(SEMPRO_CHECKLIST_DEFINITIONS[7].jenisBentuk, "centang");
});

test("mesin QR code murni: menghasilkan matriks dan SVG yang valid", () => {
  const url = "https://sias.uts.ac.id/verifikasi/token-uji-coba-123456789";
  const matrix = generateQrMatrix(url);
  assert.ok(Array.isArray(matrix));
  assert.ok(matrix.length >= 21); // Version >= 1
  assert.equal(matrix.length, matrix[0].length); // Persegi

  // Finder pattern pojok kiri atas harus true di (0,0)
  assert.equal(matrix[0][0], true);
  assert.equal(matrix[2][2], true);

  const svg = generateQrSvg(url);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("<path d="));
  assert.ok(svg.endsWith("</svg>"));
});

test("mesin PDF murni: menghasilkan dokumen PDF 1.4 biner dengan header dan trailer", () => {
  const doc = new SimplePdfDocument();
  doc.drawKopSurat();
  doc.drawText("SURAT UJI COBA", 297.64, 700, 14, true, "center");
  doc.drawQrCode("https://sias.uts.ac.id/verifikasi/test-token", 250, 500, 80);
  const pdfBytes = doc.build();

  assert.ok(Buffer.isBuffer(pdfBytes));
  const pdfStr = pdfBytes.toString("latin1");

  // Validasi standar PDF 1.4
  assert.ok(pdfStr.startsWith("%PDF-1.4"));
  assert.ok(pdfStr.includes("/Type /Catalog"));
  assert.ok(pdfStr.includes("/Type /Pages"));
  assert.ok(pdfStr.includes("/Type /Page"));
  assert.ok(pdfStr.includes("/Type /Font"));
  assert.ok(pdfStr.includes("/BaseFont /Helvetica"));
  assert.ok(pdfStr.includes("xref"));
  assert.ok(pdfStr.includes("trailer"));
  assert.ok(pdfStr.includes("%%EOF"));
});

test("rendering dokumen resmi: Surat Undangan dan Berita Acara PDF ber-QR", () => {
  const mockUndangan = {
    token: "token-undangan-sempro-abcdef123456",
    nomorSurat: "001-b/UTS/FRS-INF/TA/II/2026",
    namaPenandatangan: "M. Julkarnain, M.Sc.",
    jabatanSnapshot: "Ketua Program Studi Informatika",
    snapshotJson: {
      mahasiswaNama: "Mahasiswa Teladan",
      mahasiswaNim: "20210001",
      tanggal: "2026-10-15",
      waktuMulai: "09:00",
      waktuSelesai: "11:00",
      ruang: "Ruang Seminar 101",
      judul: "Rancang Bangun SIAS Berbasis Next.js dan TypeScript",
      pembimbing: "Dosen Pembimbing Utama, M.Kom.",
      penguji1: "Dosen Penguji 1, M.T.",
      penguji2: "Dosen Penguji 2, M.Kom.",
    },
  };

  const undanganBytes = renderSuratUndanganPdf(mockUndangan);
  assert.ok(undanganBytes.length > 500);
  const undanganStr = undanganBytes.toString("latin1");
  assert.ok(undanganStr.includes("SURAT UNDANGAN SEMINAR PROPOSAL"));
  assert.ok(undanganStr.includes("001-b/UTS/FRS-INF/TA/II/2026"));
  assert.ok(undanganStr.includes("Mahasiswa Teladan"));

  const mockBeritaAcara = {
    token: "token-berita-acara-sempro-9876543210fedcba",
    namaPenandatangan: "M. Julkarnain, M.Sc.",
    jabatanSnapshot: "Ketua Program Studi Informatika",
    snapshotJson: {
      mahasiswaNama: "Mahasiswa Teladan",
      mahasiswaNim: "20210001",
      tanggal: "2026-10-15",
      judul: "Rancang Bangun SIAS Berbasis Next.js dan TypeScript",
      nilaiAngka: 82.5,
      hasil: "lulus_revisi",
      catatanRevisi: "Perbaiki tinjauan pustaka bab 2 dan tambahkan pengujian integrasi.",
      pembimbing: "Dosen Pembimbing Utama, M.Kom.",
      penguji1: "Dosen Penguji 1, M.T.",
      penguji2: "Dosen Penguji 2, M.Kom.",
    },
  };

  const baBytes = renderBeritaAcaraPdf(mockBeritaAcara);
  assert.ok(baBytes.length > 500);
  const baStr = baBytes.toString("latin1");
  assert.ok(baStr.includes("BERITA ACARA SEMINAR PROPOSAL SKRIPSI"));
  assert.ok(baStr.includes("LULUS DENGAN REVISI"));
  assert.ok(baStr.includes("82.50"));
});
