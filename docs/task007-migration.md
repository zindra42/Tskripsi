# TASK-007: Bukti Implementasi Migrasi Data dan Rekonsiliasi Rilis SIAS TypeScript

Referensi Laravel adalah `D:/sis/skripsi`, dibaca tanpa perubahan. Target adalah root repository `Tskripsi`. Prasyarat TASK-001 s.d. TASK-006 telah digabung ke branch `main` (commit `cd91063`). Catatan ini melengkapi audit dan temuan TASK-002 serta TASK-009 untuk gerbang cutover rilis.

## 1. Inventaris Skema Terminal dan Bukti Migrasi Sumber
- **Audit 78 Migration up()**: Pemeriksaan offline terhadap 78 file migration Laravel melalui `scripts/audit-legacy-schema.mjs` mengidentifikasi 51 tabel terminal sumber dan 52 tabel target.
- **Klarifikasi Migration 28 September**: `2026_09_28_120000_optimize_database_schema_and_drop_obsolete_tables.php` dibuktikan hanya menghapus tabel `password_reset_tokens` dan menambahkan indeks; tabel `jobs`, `job_batches`, `cache`, dan `log_super_admin` tetap dipertahankan pada skema terminal sumber (dan diarsipkan pada target).
- **Integritas FK id_sidang_daftar**: Dikonfirmasi bahwa sumber tidak memiliki constraint FK fisik pada `penugasan_penguji.id_sidang_daftar` dan `checklist_dokumen.id_sidang_daftar`. Target PostgreSQL memasang FK eksplisit `ON DELETE RESTRICT` dan preflight validator (`validateSnapshot` & `reconcileSidang`) menolak keberadaan orphan logis maupun fisik.
- **Resolusi Siklus Dependensi**: Topologi pemindahan data memisahkan penyisipan bertahap untuk memutus 2 siklus relasional:
  1. `pendaftaran_sempro` <-> `dispensasi_kehadiran_sempro` (disisipkan tanpa `dispensasi_id`, lalu dipulihkan pada tahap pemulihan FK).
  2. `dokumen_verifikasi` self-reference `digantikan_oleh_id` (disisipkan awal tanpa relasi pengganti, lalu dipulihkan setelah seluruh dokumen terdaftar).

## 2. Arsitektur Importer dan Preservasi Integritas
- **Dry-run Validator (`scripts/migration-dry-run.ts`)**: Validator offline berbasis stream/file tanpa membuka koneksi database atau mengeksekusi mutasi. Memverifikasi manifest berkas, format bigint string, integritas snapshot JSON, timezone WITA, dan aturan bisnis legacy.
- **Preservasi Identitas & Status**: Format historis `.deleted.<timestamp>` pada email dan `_DEL_<timestamp>` pada NIM dipertahankan persis tanpa normalisasi destruktif. Password hash bcrypt cost 12 disimpan utuh.
- **Preservasi Keputusan Legacy**: Status berita acara legacy (termasuk keputusan dua tingkat dengan approval default atau tanpa backfill) dipertahankan melalui `source_hasil`, `source_status_persetujuan`, dan metadata provenance transformasi.
- **Preservasi Nilai & Waktu**: Nilai desimal disimpan dengan string numerik fixed-point (misal `79.99`, `80.01`) tanpa pembulatan ulang. Timestamp sumber ditafsirkan sebagai WITA dan disimpan sebagai representasi UTC ISO-8601.

## 3. Manifest Berkas dan Kompatibilitas URL Legacy
- **Dual Disk Storage (`private` & `public`)**: Manifest berkas memetakan kepemilikan berkas (tabel, kolom/pointer JSON, PK, disk, ukuran, MIME, dan SHA-256). Proteksi traversal dan penolakan symlink diterapkan di `safeRelative()`.
- **Rute Kompatibilitas Legacy (`src/app/[...legacy]/route.ts`)**:
  - Alias download sempro/sidang: `/proposal/download/{id}`, `/sempro/checklist/file/{id}`, `/(sempro|sidang)/revisi-draft/{id}`, `/sempro/download-document/...`, dll. dialihkan ke route internal yang aman.
  - Akses `/storage/...` diverifikasi hak aksesnya sesuai peran sesi aktif sebelum melayani konten dokumen historis.
  - Endpoint dokumen (`/api/sempro/dokumen/[token]` dan `/api/sidang/dokumen/[token]`) mendukung pembacaan berkas PDF historis dari cache arsip atau manifest berkas impor.

## 4. Jurnal Impor, Idempotensi, dan Checkpoint
- **Tabel Jurnal Impor Baru**:
  - `legacy_import_runs`: Mengikat binding hash snapshot dan versi mapping (`sias-ts-legacy-import-v1`).
  - `legacy_import_checkpoints`: Mencatat progres tahapan impor bertahap per batch (chunk 250 rows).
  - `legacy_import_rows`: Menyimpan row mentah sumber dan audit provenance untuk rekonsiliasi.
  - `legacy_import_files`: Menginventarisasi deskriptor berkas terkait data impor.
- **Idempotensi & Transaksi**: Adapter PostgreSQL menggunakan transaksi terisolasi dengan exclusive advisory lock (`pg_advisory_xact_lock(735027007)`), rollback instan pada kegagalan chunk, dan pemulihan checkpoint tanpa duplikasi. Penataan sequence ID menggunakan transactional `ALTER SEQUENCE ... RESTART WITH` (bukan `setval`).

## 5. Hasil Verifikasi dan Rehearsal Sintetis
- **Suite Pengujian Sintetis (`tests/migration.test.ts`)**:
  - Rehearsal sintetis penuh menguji 78 up() bodies, preservasi bigint di atas `MAX_SAFE_INTEGER`, deteksi orphan FK, cycle replacement, integritas berkas, partial failure rollback, dan rekonsiliasi identitas/sequence.
  - Hasil `npm test`: **146 passed / 146 total** (136 tes regresi domain + 10 tes migrasi & rekonsiliasi komprehensif).
- **Validasi Build & Kualitas Kode**:
  - `npm run typecheck`: Lulus tanpa error.
  - `npm run lint`: Lulus tanpa error dan tanpa warning.
  - `npm run prisma:validate`: Schema valid.
  - `npm run build`: Build Next.js 16.4.5 sukses.
  - `git diff --check`: Lulus bersih tanpa whitespace error.

## 6. Batasan dan Gerbang Cutover Riil (Release Gates)
1. **Tidak Ada Eksekusi Impor Riil pada Sesi Ini**: Sesuai business rule dan batas otorisasi, mutasi database fisik PostgreSQL hanya boleh dilakukan melalui mekanisme proposal database Sokudo yang disetujui pemilik.
2. **Kebutuhan Snapshot Produksi & Ekspor Terkontrol**: Eksekusi dry-run dan cutover nyata memerlukan snapshot database MariaDB/MySQL terkontrol serta direktori storage `private`/`public` aktual.
3. **Penyelarasan Hostname QR**: Hostname domain QR lama (`https://sias.uts.ac.id`) harus disiapkan pada DNS/reverse proxy cutover agar token verifikasi QR fisik yang telah dicetak tetap dapat diverifikasi di sistem baru.
