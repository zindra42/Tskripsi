# Bukti TASK-007

Kontrak, inventaris terminal dengan rujukan source, batas parser, urutan impor, manifest, gerbang rilis dan rollback tersedia pada [panduan migrasi](legacy-migration.md). Target adalah root Tskripsi; source Laravel D:/sis/skripsi hanya dibaca.

Inspeksi offline membaca 78 body up() sampai 5 November 2026. Katalog menemukan 51 tabel sumber, termasuk enam tabel infrastruktur yang diarsipkan tanpa mengaktifkan sesi/antrean Laravel. log_super_admin tetap merupakan tabel audit bisnis pada target. Target setelah migration keenam yang diusulkan memiliki 52 tabel; status 47 tabel terpasang berasal dari brief pemilik dan belum diverifikasi ulang pada sesi ini.

Mapping memakai sias-terminal-20261105-v1. Timestamp hanya dikonversi setelah timezone ekspor UTC/WITA beserta buktinya dinyatakan; timezone database historis tidak disimpulkan dari konfigurasi renderer. Bcrypt PHP berbagai cost yang didukung serta Argon2 dipertahankan persis. Dry-run menampung data snapshot dalam memori; hanya pembacaan byte berkas yang dilakukan secara streaming.

Hasil yang telah diamati pada 8 November 2026:

- npm test: 155/155 lulus, termasuk 19 tes migrasi/endpoint; seluruhnya sintetis.
- npm run migration:rehearsal: 51 tabel, 54 row, 53 tahap, delapan entri berkas; dry-run, rollback/restart/reimport dan rekonsiliasi lulus. liveImportExecuted:false, cutoverVerified:false.
- npm run prisma:generate, npm run prisma:validate, npm run typecheck: lulus.
- npm run lint dan npm run build: lulus. git diff --check: lulus.
- LSP dipanggil ulang untuk seluruh 24 berkas TypeScript yang berubah: 13 tanpa error, 11 timeout. Timeout terakhir mencakup `scripts/migration-dry-run.ts`, route legacy, route dokumen sempro, `migration/catalog.ts`, `document-files.ts`, `files.ts`, `postgres.ts`, `urls.ts`, `validate.ts`, fixture migrasi dan tes endpoint migrasi. LSP seluruh versi akhir belum dapat disahkan; typecheck/build lulus.
- E2E Sokudo run bfa82278-2ffc-45d3-a7d2-437961584f38: auth-guest lulus 18/18; accounts-guest gagal pada langkah index 6/baris 12 (assertion label semester, enam langkah sebelumnya berhasil). Screenshot memperlihatkan label tersedia; kegagalan pencocokan runner masih belum terselesaikan. Kedua flow lulus validasi YAML. Server development worktree port 3107 telah dihentikan.

Tidak ada impor, penerapan SQL, query database nyata, source snapshot nyata, smoke pengguna aktif atau cutover pada sesi ini. Hostname QR cetak belum ditetapkan/diverifikasi; jangan memakai domain contoh sebagai keputusan deployment. Kehilangan ACC pra-backfill, ownership cache versi lama, URL notification yang belum terpetakan dan parity PDF memerlukan bukti ekspor serta tinjauan pemilik.

Review zindra terhadap HEAD 8e9c82a belum memberikan sign-off implementasi: diff terpotong sebelum kode inti, indeks pencarian masih checkout utama, dan sesi reviewer tidak memiliki pembaca file/izin command. Temuan angka tes README yang tertinggal telah diperbaiki setelah `npm test` dijalankan ulang dan lulus 155/155. Review ini tidak membuktikan keamanan importer/endpoint dan tidak menjadi persetujuan merge atau cutover.
