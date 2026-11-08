# Migrasi dan rekonsiliasi SIAS — TASK-007

## Batas bukti

Tooling di root Tskripsi ini menjalankan inspeksi source, dry-run berkas lokal, dan rehearsal sintetis. Tidak ada CLI live-import, koneksi database, seed, migration SQL yang dijalankan, atau perubahan Laravel. Keputusan provider, snapshot, freeze dan jadwal cutover tetap milik pemilik. Status 47 tabel PostgreSQL pada 8 November 2026 berasal dari brief pemilik; bukan hasil pemeriksaan database pada run ini.

`src/lib/migration/source-schema.json` mencatat 78 migration, SHA-256 file dengan newline LF, SHA-256 body `up()`, rentang baris, seluruh operasi kolom, PK/unique/FK, raw SQL dan perubahan data. Ini pembacaan source sampai 5 November 2026, bukan bukti seluruh migration diterapkan pada snapshot. `target-schema.json` berasal dari schema Prisma dan memuat checksum schema tersebut. Regenerasi offline:

```sh
npm run migration:audit-source -- D:/sis/skripsi
```

Parser tidak menjalankan PHP. Katalog memodelkan jalur MySQL kronologis normal; kondisi `!hasColumn` atas kolom yang telah ada tidak menciptakan FK baru. Semua tipe, nullability, kolom, PK/unique dan FK snapshot tetap harus cocok dengan metadata ekspor `information_schema`. Perbedaan deployment, collation atau cabang migration adalah gap yang harus ditinjau, bukan alasan untuk mengubah katalog otomatis. File di luar cutoff ditolak. Metadata tabel `migrations` dipisahkan menjadi ledger `source.migrations`, bukan diimpor sebagai tabel bisnis.

## Inventaris terminal dan bukti

51 tabel sumber dibedakan dari jumlah tabel target:

- Identitas/referensi: `pengguna`, `mahasiswa`, `dosen`, `admin_keuangan`, `bidang_keahlian`, `dosen_keahlian`, `pengaturan_sistem`, `password_reset_requests`, `keahlian_change_requests`, `biodata_change_requests`.
- Akademik/administrasi: `verifikasi_pembayaran`, `pengajuan_judul`, `bimbingan`, `logbook_bimbingan`, `jadwal_bimbingan`, `pengajuan_perubahan_judul`, `arsip_judul_skripsi`.
- Sempro: `pendaftaran_sempro`, `checklist_dokumen`, `penugasan_penguji`, `jadwal_sempro`, `berita_acara`, `konfirmasi_jadwal_sempro`, `kehadiran_seminar`, `dispensasi_kehadiran_sempro`, `riwayat_jadwal_sempro`, `permohonan_sempro`.
- Sidang/revisi: `pendaftaran_sidang`, `pembayaran_sidang`, `jadwal_sidang`, `konfirmasi_jadwal_sidang`, `rubrik_penilaian`, `penilaian_sidang`, `riwayat_jadwal_sidang`, `permohonan_sidang`, `revisi_dokumen`.
- Dokumen/komunikasi/audit: `nomor_surat_dasar`, `nomor_surat_kategori`, `dokumen_verifikasi`, `pengumuman`, `pengumuman_dibaca`, `notifications`, `notifikasi`, `log_aktivitas`, `log_super_admin`.
- Infrastruktur yang masih didefinisikan source: `sessions`, `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`. Seluruh row disimpan sebagai arsip impor, tidak diaktifkan menjadi sesi/cache/antrean Next.js.

Target setelah migration keenam memiliki 52 tabel: 45 tabel domain, tiga tabel runtime TypeScript (`auth_sessions`, `auth_rate_limits`, `academic_receipts`) dan empat jurnal `legacy_import_*`. Migration baru juga menambahkan `permohonan_sempro`, kolom konfirmasi lama jadwal sempro, kolom historis BA dan nullable nama penandatangan yang belum tercakup target sebelumnya. Semua ini diperlukan untuk menghindari kehilangan kolom sumber. Lima migration terpasang tidak diubah. Migration keenam hanya disiapkan sebagai SQL untuk proposal pemilik.

Rujukan berikut relatif ke `D:/sis/skripsi/`; nomor baris terdapat juga dalam katalog:

- `database/migrations/0001_01_01_000001_create_cache_table.php:14` membuat cache/cache_locks; `0001_01_01_000002_create_jobs_table.php:14` membuat jobs/job_batches/failed_jobs. Tidak ada penghapusan terminal atas tabel tersebut dalam 78 `up()`.
- `2026_09_16_025007_drop_otp_codes_table.php:14` menghapus `otp_codes`. `2026_09_28_120000_optimize_database_schema_and_drop_obsolete_tables.php:15` hanya menghapus `password_reset_tokens`, lalu menambah indeks. `2026_10_10_070323_add_superadmin_features_and_internal_log_tables.php:19` membuat `log_super_admin`; tabel itu tetap ada.
- `2026_09_30_120000_sias_batch_revisi.php:33` menandai seluruh pembayaran perlu verifikasi ulang. Backfill semester/periode hanya pengajuan belum terisi dan tidak terhapus, memakai tanggal pengajuan tersimpan serta NIM, dengan cabang MySQL dan fallback. `2026_10_08_130000_fix_perlu_verifikasi_ulang_status.php:13` kemudian menghapus flag untuk menunggu/ditolak dan terverifikasi dengan transfer terisi. Importer mempertahankan nilai akhir, tidak mengulang backfill.
- `2026_10_04_180001_update_ruang_sidang_frs_to_ruang_seminar_frs_in_jadwal_sempro.php:12` mengganti nama ruang; migration `180002` menambah dua threshold. `2026_10_04_200000_purge_redundant_sempro_checklist_items.php:14` menghapus item 2/3/11 tanpa filter proses. `2026_10_10_234500_remove_item_4_kwitansi_from_sempro_checklist.php:12` menghapus item 4 tanpa filter proses. Nama file bukan predicate query.
- `2026_10_05_070000_release_deleted_users_credentials.php:14` memakai `.deleted.<timestamp>` dan `_DEL_<timestamp>`. `2026_10_19_140000_update_modul_0_2_paket_a_tables.php:26` menambahkan arsip dan nullable identitas. `app/Models/Pengguna.php:49` mengarsipkan saat event soft-delete, berbeda dari cleanup query builder. Pencocokan selalu menggunakan ID, bukan email/NIM/NIDN. Identitas dipakai ulang dilaporkan sebagai observasi, tanpa penggabungan akun.
- `2026_10_05_090000_update_sempro_checklist_document_names_and_descriptions.php:14` memperbarui nama/deskripsi berdasarkan nomor; `2026_10_05_100000_create_dispensasi_kehadiran_sempro_and_snapshots_table.php:14` mengisi tanggal persetujuan dengan COALESCE dan membentuk siklus sempro/dispensasi. `2026_10_05_130000_add_similarity_threshold_to_pengaturan_sistem.php:13` menambah threshold kemiripan.
- `2026_10_05_150000_backfill_dokumen_acc_dan_hapus_skema_lama.php:15` membaca seluruh ACC, melewati bimbingan yang hilang, membuat token lowercase acak hanya bila belum ada, menyimpan file/tanggal/ID lama dalam snapshot, hash null dan tanggal terbit sumber. Pendaftaran pertama untuk pengajuan dipilih dengan `first()` untuk perubahan checklist item 1. Kolom `id_acc` dan tabel `dokumen_acc` kemudian dihapus (`:90`). Ekspor terminal tidak dapat membuktikan jumlah ACC yang sudah terlewat; backup pra-backfill atau pernyataan kehilangan informasi tetap gerbang rilis.
- `2026_10_05_160000_create_sempro_penjadwalan_revisi_tables.php:14` membuat riwayat/permohonan, pengaturan, lalu mengisi status jadwal dari konfirmasi/tanggal. Status, waktu terbit dan revisi undangan sumber dipertahankan tanpa menjalankan layanan penjadwalan.
- `2026_10_19_150000_create_revisi_dokumen_and_paket_b_tables.php:14` membuat revisi berversi, pengaturan tenggat dan VARCHAR status revisi. `2026_10_20_090000_fix_status_revisi_column_and_academic_periods.php:14` menegaskan tipe serta periode akademik. `2026_10_20_100000_create_paket_c_schema_periode_siklus_and_sidang.php:14` mengisi pembayaran berperiode null memakai periode aktif (fallback 2026-08-01 s/d 2027-01-31), siklus 1, dan menambah siklus domain serta sidang/pembayaran historis.
- `2026_09_14_100001_create_modul2_tables.php:33` dan `:50` hanya mendeklarasikan bigint nullable `id_sidang_daftar`. `2026_10_20_110000_create_paket_f_jadwal_sidang_and_konfirmasi_tables.php:59` menambah FK penguji hanya jika kolom belum ada. Tidak ada perbaikan berikutnya pada jalur normal. Validator menguji kedua FK logis ke pendaftaran sidang, selain seluruh FK source dan target; target memiliki constraint eksplisit dari TASK-006.
- `2026_10_20_120000_create_paket_g_rubrik_and_penilaian_sidang_tables.php:14` membuat rubrik, nilai DECIMAL(5,2), nullable jadwal BA dan kolom keputusan. `2026_10_20_233000_create_paket_k_pengumuman_tables.php:10` membuat pengumuman/read receipt; `2026_10_21_070000_add_lampiran_path_to_pengumuman_table.php:10` menambah lampiran. `2026_10_23_183000_update_checklist_dokumen_jenis_bentuk.php:12` memakai filter proses eksplisit untuk perubahan bentuk item.
- `2026_10_27_110000_add_snapshot_and_settings_for_sidang.php:14` menambah snapshot BA, batas lulus 51 dan metode `rekap_rata_rata`. Nilai historis tidak dihitung ulang. Migration `2026_10_27_120000...:13` menambah slot usulan; `2026_10_28_100000_create_sidang_penjadwalan_revisi_dan_monitoring_tables.php:14` membuat riwayat/permohonan/pembimbing sidang serta pengaturan.
- `2026_10_28_110000_normalize_legacy_notification_urls.php:14` memproses notifications.data yang memuat jnfuts/http/https dan memanggil `NotificationService::normalizeUrl` (`app/Services/NotificationService.php:26`). Importer tidak menulis ulang payload; runtime menormalkan origin menjadi tautan internal. URL tidak terpetakan dan JSON rusak masuk releaseGaps.
- `2026_11_04_120000_add_two_tier_approval_to_berita_acara_table.php:14` menambah approval default. `2026_11_04_133000_backfill_legacy_berita_acara_two_tier_approval.php:13` mengisi approval hanya hasil non-null dengan approval null/default, waktu COALESCE(ditetapkan_at, updated_at, now()). Predicate `app/Models/BeritaAcara.php:358` tetap mengakui tiga hasil legacy resmi atau hasil dengan timestamp persetujuan. Raw hasil/status/waktu tetap utuh; `preserveLegacyDecision()` menyimpan provenance dan predicate kompatibilitas, tanpa timestamp buatan.
- `2026_11_05_100000_update_kehadiran_seminar_for_manual_addition.php:13` membuat foto nullable, flag manual dan aktor. `2026_11_05_120000_cleanup_legacy_pembayaran_dan_peran_keuangan.php:12` mengubah item 11 bernama pembayaran/kwitansi tanpa filter sempro dan menonaktifkan/soft-delete seluruh akun keuangan. Row pembayaran dan profil historis tetap diimpor. Keuangan yang diaktifkan lagi setelah cleanup harus dibuktikan operator; preflight menandainya ambigu.

## Kontrak ekspor terkontrol

`assembleSnapshot()` menerima capture hasil ekspor yang telah disetujui, tidak membuka koneksi. Ekspor konsisten harus mencakup seluruh 51 tabel termasuk kosong, soft-deleted dan arsip, ledger batch migration + hash source, source revision, schema aktual, waktu ekspor, dua disk lengkap, origin QR cetak dan bukti timezone koneksi ekspor. Jangan membentuk metadata schema aktual dari katalog yang diharapkan: itu akan menutupi drift.

- Format `sias-controlled-export-v1`; mapping `sias-terminal-20261105-v1`; ID snapshot + checksum seluruh payload dan checksum/count setiap tabel. Hash adalah pengikat integritas/retry, bukan tanda tangan keaslian operator.
- Bigint/ID/ukuran berupa string desimal. Nilai unsigned di atas BIGINT PostgreSQL menjadi blocker, tidak dibulatkan. Signed bigint cache dipertahankan sebagai string. Decimal memakai string dengan skala tepat, IPK 3,2 dan nilai 5,2.
- SQL NULL berupa `null`. JSON berupa `{"$json":"<teks JSON asli>"}` termasuk JSON null. Angka bigint dalam JSON tidak dibulatkan saat pembandingan; spasi/key order JSONB dinormalisasi untuk pembandingan semantik tanpa mengubah payload sumber di arsip.
- Timestamp sumber tanpa zona dalam format `YYYY-MM-DD HH:mm:ss`, date tetap `YYYY-MM-DD`. `UTC` atau `Asia/Makassar` memerlukan bukti timezone ekspor. Konversi menulis representasi UTC pada target timestamp(0), sesuai pembacaan Prisma. `config/app.php:68` dan renderer dokumen membuktikan WITA aplikasi, bukan timezone sesi SQL/ekspor historis. Fraksi detik, zero date dan timezone tak terbukti ditolak untuk tinjauan mapping berikutnya.
- Password hash bcrypt PHP/Argon2 dipertahankan persis. Token remember/sesi/cache/antrean Laravel tidak dipakai sebagai autentikasi baru; pengguna login ulang. Identitas aktif/arsip/status/deleted_at tetap terpisah.
- Versi pra-ACC, pasca-ACC sebelum arsip, sebelum backfill approval dan sebelum cleanup dikenali lewat prefix ledger, lalu ditolak sebagai epoch belum didukung. Tidak ada rekonstruksi token hilang atau perubahan data diam-diam. Ledger tak cocok menjadi `schema-version-unverified`.

Snapshot, laporan terperinci, storage dan cache binding operator harus di luar Git serta web root, pada lokasi privat dengan ACL pemilik. Jangan melampirkan snapshot/credential ke tiket. `.gitignore` hanya pertahanan tambahan. File sintetis di `tests/fixtures` bukan data ekspor nyata.

## Topologi, checkpoint dan rekonsiliasi

`tableOrder()` menyortir gabungan FK source, FK target, notifiable pengguna dan dua FK sidang logis. Siklus tambahan menghentikan preflight. Urutannya mengikuti referensi/config/arsip → pengguna → profil/pivot/permohonan → administrasi/pengajuan → bimbingan/logbook → sempro → dispensasi → sidang/pembayaran → assignment/jadwal/konfirmasi/riwayat/kehadiran → BA/nilai/revisi/checklist → nomor dasar/kategori → dokumen → komunikasi/audit, dengan urutan dependensi yang sebenarnya sebagai prioritas.

Pendaftaran sempro diinsert dengan dispensasi_id null; seluruh dokumen diinsert dengan digantikan_oleh_id null. Setelah insert seluruh tabel, kedua edge dipulihkan dalam transaksi tersendiri. Orphan, kepemilikan dispensasi salah dan loop penggantian menghentikan import. Relasi JSON preferensi dosen, keahlian dan approver revisi diperiksa secara lossless. Payload audit/snapshot historis lainnya dipreservasi; interpretasi struktur tambahan membutuhkan tinjauan ekspor.

Importer menerima `ImportStore`, adapter SQL menerima penyedia transaksi satu koneksi fisik BEGIN/COMMIT/ROLLBACK. Tidak ada pembacaan DATABASE_URL atau pembuatan client. Penyedia transaksi dan eksekusi nyata hanya boleh melalui pekerjaan/proposal yang disetujui di Database Manager Sokudo. Bukan menjalankan modul importer dengan shell terhadap DB nyata.

- Target harus kosong, termasuk sesi/receipt runtime; tidak ada upsert yang menimpa histori. Raw source dan provenance disimpan di `legacy_import_rows` dalam transaksi yang sama dengan row bisnis.
- Setiap chunk dan pemulihan memiliki checksum serta checkpoint atomik. Binding mencakup ID/checksum snapshot dan versi mapping. Snapshot lain ditolak; batch size berbeda pada restart ditolak lewat checksum checkpoint. Retry memeriksa ulang arsip dan row target sebelum melewati tahap.
- Lock advisory transaksi 735027007 memisahkan import bersamaan. Seluruh penulis aplikasi/scheduler wajib dibekukan selama import; lock ini tidak menggantikan freeze aplikasi.
- Setelah kedua edge dipulihkan, final verification memeriksa seluruh row. Reset sequence memakai MAX(id)+1 dan ALTER SEQUENCE RESTART transaksional, bukan setval/nextval. Rehearsal SQL nyata masih wajib; mock query hanya membuktikan bentuk statement.
- Tidak ada bootstrap Laravel/Eloquent: hook `ChecklistDokumen::saved` (`app/Models/ChecklistDokumen.php:43`) tidak berjalan. Status/waktu/penjadwalan sumber tidak diturunkan ulang dari checklist.
- `capturePostgres()` menyiapkan SELECT lossless pada transaksi read-only REPEATABLE READ yang disediakan operator, termasuk state sequence tanpa memajukannya. `reconcileImported()` membandingkan hitungan, duplicate/PK, setiap kolom yang diimpor, null/JSON, decimal, timestamp, identitas/hash, periode/siklus, token/nomor/lifecycle, raw archive/provenance, manifest dan sequence. Per-column digest serta jumlah decimal disediakan tanpa mencetak nilainya. Jalankan sebelum smoke yang menulis data baru.

Seluruh snapshot dan plan saat ini berada di memori; jumlah chunk membatasi transaksi, bukan ukuran input. Ukuran snapshot besar harus direhearsal dengan pengukuran RAM/durasi pada host sasaran sebelum persetujuan live.

## Berkas, token dan URL

Manifest membedakan private/public walaupun relative path sama. Entri memuat pemilik tabel+PK+kolom/JSON pointer, disk/path, ukuran string, MIME sniffed, SHA-256 byte, versi/status, URL dan bukti ownership. Inventory memindai kedua disk; berkas tanpa pemilik tetap dicatat untuk review. Path absolut/traversal, Windows alternate streams, encoding ambigu, symlink/junction dan perubahan berkas selama pembacaan ditolak.

Cakupan referensi mencakup proposal, checklist, KRS/transfer/kwitansi, JSON pembayaran semester sebelumnya, revisi semua versi, foto kehadiran nullable/manual, lampiran serta snapshot_json.file_acc_lama. Tidak ada kolom foto profil pada inventaris migration terminal; foto lepas di disk tetap disimpan sebagai inventory tanpa menebak pemiliknya. Root disk dari `config/filesystems.php:33` ialah storage/app/private dan storage/app/public.

Cache PDF historis tidak membawa versi dalam namanya. `assembleSnapshot(...cacheBindings)` hanya menerima binding disk/path/documentId/version/status beserta bukti operator; mismatch dan pemilik cache ganda ditolak. Contoh pola yang harus dicek operator: `dokumen_terbit/a/Surat_ACC_Sempro_<pengajuan>.pdf`, `b/Undangan_Sempro_<jadwal>.pdf`, `c/Form_Penilaian_Sempro_<peran>_<jadwal>_<penilai>.pdf`, `d/berita_acara_<jadwal>.pdf` dan `d/Berita_Acara_Sempro_<jadwal>.pdf`. Bukti `routes/web.php:678`, `:709`, `:808`, `:859` dan `SuperadminKoreksiService.php:630`. Nama tidak membuktikan token/versi; cetakan yang tertinggal di luar snapshot memerlukan pemeriksaan QR terpisah.

`fileSha256` memverifikasi byte. `dokumen_verifikasi.hash_sha256` tetap raw/nullable: `DokumenVerifikasiService.php:576` menghitung hash JSON rubrik terurut untuk form sempro, bukan byte PDF; generator/jenis lain perlu pemeriksaan semantiknya sendiri. Importer tidak menyamakan kedua hash.

Token, kapitalisasi, versi, snapshot signer, nomor lengkap dan alokasi tahun/kategori, timestamp penerbitan/pencabutan, aktor serta self-reference dipertahankan. Alokasi baru melanjutkan MAX(nomor_urut) tahun WITA, sehingga nomor impor yang jarang tidak dipakai ulang.

Endpoint `/verifikasi/{token}` mempertahankan pencarian token persis. Alias proposal/checklist sempro-sidang, revisi, foto, dokumen sempro kategori a/b/c/d beserta alias nama, dokumen sidang dan `/storage/` diarahkan ke endpoint berotorisasi. ACC sidang memprioritaskan ID pengajuan lalu fallback ID pendaftaran. `/storage/` hanya melayani pemilik yang terpetakan; inventory tanpa pemilik tidak menjadi public static file. Payload notifications.data tetap utuh; URL yang belum terpetakan masuk `releaseGaps`.

Dokumen yang mempunyai arsip impor hanya dilayani dari byte manifest yang cocok dengan versi/status/hash/disk setelah otorisasi, tidak dirender ulang memakai template TypeScript. Byte hilang menghasilkan 409 dan menjadi blocker paritas dokumen. Sidang legacy tanpa PDF tersimpan memerlukan export PDF terkontrol serta binding operator. Revisi lama, status dicabut/digantikan dan akses lintas pengguna tetap dibatasi endpoint tujuan.

Perbedaan source pencabutan undangan telah terbukti: `SidangJadwalService.php:631`, `:724`, `:817` memakai id_jadwal, sedangkan penerbitan di `DokumenVerifikasiService.php:430` memakai id_jadwal_sidang. `reconcileSidang()` memblokir undangan sah dengan FK/versi/status jadwal ambigu; importer tidak mengoreksi histori sepihak.

## Perintah offline

```sh
npm run migration:rehearsal
npm run migration:dry-run -- <snapshot-privat.json> <private-root> <public-root> <laporan-privat.json>
```

Dry-run tidak menulis DB maupun source/storage. Hanya laporan baru dibuat dengan flag wx dan mode 0600; Windows tetap memerlukan ACL lokasi privat yang benar. Error parser tidak mencetak payload. stdout hanya valid/issueCount; laporan menghilangkan source rows/path/token/hash credential, tetapi tetap privat karena memuat PK, metadata dan checksum snapshot. `valid` hanya berarti integrity preflight; `releaseGaps` dan `cutoverVerified:false` terpisah.

## Gerbang rilis dan rollback

1. Pemilik menetapkan snapshot/exporter, target, jadwal, penanggung jawab, retensi dan rollback window. Ajukan SQL migration keenam beserta backup/restore plan lewat Database Manager. Jangan menerapkannya ke 47 tabel aktif tanpa proposal.
2. Validasi restore backup DB dan kedua disk pada lingkungan rehearsal terisolasi. Catat snapshot identity, hash, ledger/schema, timezone, ruang disk, RAM, durasi, hostname QR dan hasil restore; bukti aktual harus berada dalam penyimpanan privat yang disetujui.
3. Freeze semua penulis sumber dan target termasuk queue/cron/reminder. Ambil consistent export + disk snapshot setelah freeze; cocokkan manifest sebelum dan sesudah transfer. Simpan source tetap dapat diaktifkan kembali.
4. Tinjau dry-run dan semua releaseGaps: ACC yang sudah hilang, FK/logical JSON, ambiguity undangan, cache/versi, URL notification, identitas konflik dan QR cetak. Pemilik menyetujui laporan/checksum dan proposal eksekusi; hasil sintetis bukan pengganti keputusan ini.
5. Pada target kosong yang sudah disetujui, lakukan import bertahap melalui operasi database Sokudo yang disetujui, pulihkan edge lalu sequence. Restart hanya dengan binding dan batch size yang sama. Bila gagal, jangan membuka trafik ke data parsial.
6. Capture target konsisten dan rekonsiliasi semua row, status, soft-delete, nilai, siklus, alokasi/token/lifecycle dan byte manifest. Pastikan tidak ada duplikasi/orphan. Simpan laporan serta bukti parity PDF/QR sebelum smoke yang menulis data.
7. Smoke akun aktif semua role, forced password/restore, histori dosen nonaktif, judul/bimbingan, sempro/sidang, nilai/revisi/approval, pembayaran historis, pengumuman, notifikasi, download dan QR lama. Jalankan melalui Sokudo E2E pada fixture/akun uji yang disetujui. Periksa authorization negatif dan PDF asli, bukan status HTTP saja.
8. Pemilik menyetujui alih trafik/origin dan pemeliharaan hostname QR lama/sertifikat/URL. Verifikasi QR cetak dari beberapa versi; jangan mengganti token. Aktifkan scheduler hanya setelah tidak berpotensi mengirim ulang komunikasi historis.
9. Pantau error, latency, antrean, login, unduhan hilang dan hasil rekonsiliasi selama rollback window. Catat pemilik keputusan, batas waktu dan pemicu rollback (mismatch data/byte/token, orphan, smoke kritis gagal).
10. Rollback sebelum target menerima writes baru: freeze target, arahkan trafik kembali ke source yang masih frozen/terpelihara, pulihkan backup target+disk sebagai pasangan tervalidasi. Jangan menghapus row impor per tabel atau mencoba down() migration data Laravel yang irreversible. Sesudah writes baru masuk, freeze keduanya dan minta keputusan rekonsiliasi delta pemilik sebelum beralih; rollback otomatis akan kehilangan data baru.

Kode offline dan rehearsal sintetis dapat selesai sementara rehearsal PostgreSQL, ekspor aktual, paritas semua PDF/QR, smoke pengguna aktif, persetujuan proposal dan cutover tetap belum terbukti. Semua gerbang tersebut wajib dicatat terpisah saat sign-off rilis.
