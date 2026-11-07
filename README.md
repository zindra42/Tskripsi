# SIAS TypeScript

Fondasi pembangunan ulang SIAS dalam satu aplikasi Next.js App Router dengan TypeScript strict, Tailwind, Prisma, dan PostgreSQL. Source Laravel di repository sibling `skripsi/` menjadi referensi perilaku bisnis.

## Runtime dan dependensi

- Diverifikasi pada 7 November 2026 menggunakan Node `26.11.1` dan npm `11.20.0`.
- Next.js `16.4.5`, React `19.3.1`, Prisma dan adapter PostgreSQL `7.10.1`, TypeScript `5.9.3`, Tailwind `4.3.5`.
- Dokumentasi Next.js mensyaratkan Node minimal `20.9`. Metadata engine Prisma 7.10.1 menerima `^20.19 || ^22.12 || >=24.0`. Aplikasi ini menetapkan Node minimal 26 untuk menyamakan runtime lokal yang telah diuji.
- Registry Prisma menandai `8.0.0-rc.33` sebagai `latest` saat pemeriksaan. Versi stabil 7.10.1 dipilih agar fondasi menggunakan rilis stabil.
- Semua dependensi langsung dipin dan `package-lock.json` disertakan. Lifecycle script instalasi dinonaktifkan melalui `.npmrc`. Prisma Client dibuat secara eksplisit.
- ESLint 9.39.5 dipilih sesuai peer dependency plugin React/import/a11y bawaan Next. npm memberi peringatan deprecation untuk ESLint 9. ESLint 10 masih menimbulkan konflik peer pada plugin tersebut saat pemeriksaan.
- Override `minimatch` 11.0.5 pada typescript-estree menghindari advisory glob amplification. Lint diverifikasi menggunakan override ini.

Rujukan resmi tersedia pada [instalasi Next.js](https://nextjs.org/docs/app/getting-started/installation), [panduan Prisma dengan Next.js](https://www.prisma.io/docs/guides/frameworks/nextjs), dan metadata engine paket di registry npm. Panduan Prisma saat pemeriksaan telah menampilkan persyaratan runtime versi 8. Persyaratan versi 7 yang dipin diperiksa langsung dari metadata paketnya.

## Setup lokal

Jalankan perintah dari root repository `Tskripsi/` (atau root worktree tiket).

```sh
npm ci
npm run prisma:generate
npm run prisma:validate
npm run dev
```

Salin `.env.example` menjadi `.env.local`, kemudian isi `DATABASE_URL`, `APP_ORIGIN`, dan `AUTH_RATE_LIMIT_SECRET` melalui environment lokal. Secret rate limit harus acak dan minimal 32 karakter. Jangan commit file tersebut. Prisma CLI membaca `.env` melalui dotenv, sedangkan Next.js juga membaca `.env.local`. Perintah generate/validate/build dapat memakai URL placeholder tanpa koneksi database.

Untuk menjalankan aplikasi, sediakan PostgreSQL dengan schema `public` dan extension `citext`. Ajukan SQL `prisma/migrations/20261107000000_identity_auth/migration.sql`, kemudian `prisma/migrations/20261107010000_accounts_settings/migration.sql` melalui proposal database Sokudo dan tunggu persetujuan pemilik sebelum penerapan. Kedua migration dibungkus transaksi. SQL hanya disiapkan sebagai kode. Akun pimpinan pertama memerlukan provisioning atau impor yang disetujui. Setelah database tersedia, registrasi publik dapat digunakan melalui `/register`.

`APP_ORIGIN` harus cocok dengan origin browser, misalnya `http://localhost:3000` saat development. Produksi memerlukan HTTPS dan menggunakan cookie `__Host-sias_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, dan path `/`. Untuk mencoba autentikasi lokal melalui HTTP gunakan development server. Semua mutasi memeriksa Origin, termasuk login, logout, password, pergantian peran, dan heartbeat sesi.

`TRUST_PROXY=false` memakai pembatas global 120 percobaan per menit. Aktifkan hanya jika proxy terpercaya menimpa header `X-Forwarded-For`. Dalam mode proxy, batas IP menjadi 30 percobaan per menit. Batas email tetap 5 percobaan per menit dan berlaku lintas proses. Kunci email/IP disimpan sebagai HMAC. Percobaan yang diterima limiter mencakup login berhasil. Pembatas perubahan password adalah 5 percobaan per akun per menit. Jika database atau konfigurasi keamanan gagal, mutasi ditolak dengan pesan layanan umum.

## Cakupan autentikasi

- Login email/password, logout POST, session token acak 256 bit, dan penyimpanan SHA-256 token di database. Login mengganti sesi yang dibawa browser.
- Pembacaan status akun, soft delete, auth version, dan peran dilakukan di server setiap akses. Akun nonaktif/terhapus ditolak. Akun menunggu persetujuan atau ditolak hanya membuka halaman status dan logout. Setelah aktif, akun dengan flag wajib ganti password diarahkan ke penggantian password.
- Password baru memerlukan password saat ini, minimal 8 karakter, maksimal 72 byte UTF-8, konfirmasi yang cocok, dan nilai berbeda. Penyimpanan bcrypt cost 12. Penggantian password bersifat atomik, mencabut seluruh sesi lama dan remember token Laravel, serta menerbitkan sesi baru. Login dikunci terhadap perubahan password yang bersamaan.
- Sesi biasa memakai idle timeout server lima menit, cookie sesi browser, heartbeat berdasarkan aktivitas, dan peringatan setelah empat menit. Sesi “ingat saya” berlaku absolut tujuh hari dan melewati idle timeout. Ini mengikuti kebijakan lima menit/tujuh hari sumber. Cookie sesi biasa berakhir saat browser ditutup. Heartbeat memperbarui aktivitas tanpa menulis ulang peran.
- Setiap sesi memiliki identifier publik acak yang terpisah dari token autentikasi. Heartbeat dan timeout mengirim identifier sesi asal, dan aktivitas lintas tab memakai namespace sesi tersebut. Timeout hanya mencabut sesi biasa yang cocok. Respons dengan sesi berbeda mengarahkan tab ke area sesi aktif. Rotasi cookie ditangani login/logout sehingga respons timeout terlambat aman terhadap cookie baru.
- Kaprodi/sekpro berasal dari role historis atau flag profil dosen. Dosen dengan kedua flag memperoleh kedua area pimpinan. Role pimpinan historis memerlukan profil dosen untuk beralih ke area dosen. Pergantian area disimpan di server. Area pimpinan ditolak ketika sesi berada pada mode dosen. Superadmin mengikuti bypass role sumber, sambil tetap tunduk status akun dan wajib ganti password.
- Middleware dan endpoint role switch terkini mengizinkan perpindahan pimpinan ke dosen tanpa memeriksa penugasan. Komentar dan sebagian `RoleSwitchBugTest` lama berbeda dengan implementasi tersebut. Fondasi mengikuti implementasi terbaru. Hak pembimbing/penguji tetap harus dibuktikan dari penugasan saat modul akademik dibangun.
- Halaman dashboard menampilkan identitas dan modul yang belum tersedia. URL area yang tidak diizinkan mendapat respons 404. Server Action memeriksa kewenangan secara mandiri. Komponen client menerima nama peran, flag remember, dan identifier sesi publik yang diperlukan.

## Identitas dan paritas legacy

Schema mempertahankan tabel `pengguna`, profil satu-ke-satu dengan PK `pengguna_id`, arsip email/NIM/NIDN, nullable kredensial unik, status, catatan penolakan, flag superadmin, soft delete, dan timestamp nullable. Nomor HP mahasiswa nullable mengikuti migration `2026_10_01_181616_add_revision_features_tables.php`. `email` memakai CITEXT untuk pencarian serta keunikan case-insensitive. Arsip memakai string biasa dan tidak menjadi jalur login.

ID Laravel berasal dari unsigned bigint, dipetakan ke Prisma BigInt dan PostgreSQL BIGINT tanpa mengganti nilai dengan UUID atau JavaScript Number. PostgreSQL BIGINT memiliki batas `9223372036854775807`. Impor harus memeriksa rentang seluruh ID/FK, mempertahankan nilai dan mengatur ulang sequence setelah impor. ID unsigned di atas batas ini memerlukan keputusan skema sebelum impor. Timestamp identitas memakai timestamp tanpa zona sesuai migration Laravel. Impor harus mempertahankan interpretasi timezone sumber, sementara timestamp autentikasi baru memakai timestamptz.

Migration cleanup `2026_11_05_120000_cleanup_legacy_pembayaran_dan_peran_keuangan.php` menonaktifkan dan soft-delete akun admin_keuangan. Schema mempertahankan role serta profil historis. Status dan soft delete hasil cleanup harus ikut diimpor. Dashboard kompatibilitas untuk role tersebut menjelaskan bahwa peran telah dipensiunkan.

Verifier mendukung bcrypt `$2y$`, `$2a$`, `$2b$`, Argon2i dan Argon2id. Test memakai hash sintetis yang dibuat oleh PHP 8.4.26. Pengujian ini memverifikasi interoperabilitas format PHP, sedangkan hash akun riil belum dibaca atau diimpor. File config hashing khusus tidak ditemukan di repository dan `.env` Laravel tidak dibuka. Format hash lain ditolak secara aman dan perlu penanganan eksplisit bila ditemukan pada audit impor. Password bcrypt migrasi yang panjang tetap mengikuti semantik pemotongan 72 byte PHP, sedangkan password baru dibatasi agar menghindari pemotongan diam-diam.

Pesan login dan permohonan lupa password dibuat generik. Pemulihan berbasis persetujuan tersedia melalui `/lupa-password`. Pemberi persetujuan memperoleh token sekali untuk disampaikan langsung kepada pemilik akun. Token remember dan payload sesi Laravel lama memerlukan login ulang pada aplikasi ini.

## Verifikasi

```sh
npm ci
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

`npm run build` menghasilkan aplikasi produksi tanpa query database. `npm start` menjalankan hasil build. Typecheck setelah checkout baru memerlukan generate terlebih dahulu.

Unit test terarah mencakup hash PHP, validasi password UTF-8, status akun, mandatory password, role/flag historis, mode dosen, guard superadmin, token, dan durasi sesi. Regression test sesi menjalankan fungsi server dan endpoint dengan cookie serta database sintetis, termasuk urutan heartbeat baca, switch role selesai, heartbeat tulis dan pergantian sesi lintas tab ke sesi biasa/remember. Node module mocking untuk navigasi Next memakai flag eksperimental bawaan Node dan menampilkan peringatan saat test. UI E2E menggunakan YAML Sokudo di `e2e/`, tanpa dependensi browser automation tambahan. Flow publik `auth-guest.yaml` ditujukan untuk development server port 3100 dengan `APP_ORIGIN=http://127.0.0.1:3100`, tanpa `DATABASE_URL` maupun `AUTH_RATE_LIMIT_SECRET`. Flow memeriksa form login, pesan kegagalan konfigurasi yang aman, guard guest, dan URL role asing. Jalankan melalui e2e_validate lalu e2e_run Sokudo. Pengujian integrasi login berhasil, race transaksi PostgreSQL, rate limit PostgreSQL, SQL migration, cookie produksi, pencabutan sesi, perubahan status, serta role switch dengan akun riil masih memerlukan database dan environment pengujian yang disetujui.

Pada pengerjaan TASK-001, instalasi bersih, generate/validate Prisma, typecheck, lint, build, dan 26 unit test termasuk subtest lulus. Audit npm melaporkan nol kerentanan. Pemeriksaan HTTP development menghasilkan login 200, redirect guest dashboard 307, heartbeat tanpa Origin 403, dan heartbeat guest dengan Origin sah 401. LSP dipanggil untuk seluruh source TypeScript, CSS, dan Prisma. Analisis sempat kehilangan resolusi dependensi selama instalasi bersih. Setelah pemuatan ulang konfigurasi, seluruh source TypeScript, kedua file test, konfigurasi TypeScript, dan schema Prisma memperoleh hasil tanpa error. Pemeriksaan CSS masih timeout. YAML E2E lulus validasi inline. e2e_validate berbasis file dan e2e_run tidak menemukan suite dalam worktree tersembunyi `.sokudo/worktrees/`, sehingga browser E2E belum dijalankan. Akses PostgreSQL dan penerapan SQL belum diverifikasi.

## Batas tahap fondasi

Modul judul, bimbingan, sempro, sidang, scoring, revisi, persetujuan dua tingkat akademik, pengumuman, PDF/QR, migrasi data riil, deployment, dan hosting/storage dikerjakan bertahap. TASK-003 menambahkan akun, profil, permohonan dan konfigurasi dasar.

Pemeliharaan berkala sesi kedaluwarsa dan bucket rate limit memerlukan pekerjaan operasional lanjutan. Index waktu sudah disiapkan. Mutasi akun menaikkan `auth_version` dan mencabut sesi ketika melakukan reset password atau perubahan keamanan. Audit menyimpan perubahan identitas dan alasan tindakan. Password, hash password dan token rahasia dipisahkan dari audit.

## Akun dan konfigurasi TASK-003

- `/register` menyediakan mahasiswa, dosen dan admin keuangan. Mahasiswa memerlukan semester 7–14 sesuai NIM dan periode aktif. Dosen memilih 2–3 bidang keahlian dan dapat mengajukan status Sekpro. Hanya approval Kaprodi atau superadmin yang dapat mengaktifkan pendaftaran pimpinan.
- `/login` menghubungkan registrasi dan pemulihan password. Setelah registrasi, pengguna masuk untuk membuka status persetujuan. Aktivasi, penolakan dan perubahan keamanan mencabut sesi target sehingga pengguna masuk ulang dengan keadaan terbaru.
- `/akun` menyediakan pencarian dan pagination, persetujuan satuan/massal, penolakan dengan alasan serta soft delete sesuai kewenangan Kaprodi/Sekpro/superadmin. Persetujuan massal bersifat atomik untuk seluruh pilihan.
- `/akun/permohonan` menyediakan review biodata mahasiswa, data/keahlian dosen dan reset password. Reset milik Kaprodi hanya diputuskan Sekpro atau superadmin lain. Pengelola menyerahkan token secara langsung kepada pemilik akun. Token baru acak 256 bit, tersimpan SHA-256, terikat `auth_version`, berlaku 24 jam dan digunakan sekali. Perubahan keamanan membatalkan token yang masih disetujui.
- `/profil` menyediakan pembaruan nama tampilan sesuai `EditProfile::updateProfile()` serta pengajuan perubahan identitas, semester, HP dan keahlian. Satu permohonan pending per jenis/pengguna. Approval memeriksa ulang konflik identitas, peran dan snapshot data lama. Email yang berubah mencabut seluruh sesi pengguna.
- `/akun/baru` khusus superadmin membuat akun langsung aktif dengan password sementara acak dan wajib ganti password. `/akun/[id]` menyediakan koreksi profil, aktivasi/nonaktivasi, restore dan penetapan peran bagi superadmin. Penetapan Kaprodi memindahkan jabatan dan mencabut sesi seluruh pemegang jabatan yang terdampak.
- `/pengaturan` khusus Kaprodi pada mode pimpinan dan superadmin. Mode otomatis memakai Asia/Makassar, ganjil September–Februari dan genap Maret–Agustus. Mode manual menyimpan jenis dan tahun. Validasi periode, rentang angka, kuota, tenggat revisi dan alias `minimal_kehadiran_sempro` mengikuti source. Penyimpanan menyinkronkan kuota seluruh dosen aktif. Superadmin dapat menambahkan master bidang keahlian.

### Identitas dan keputusan kompatibilitas

Schema menambah `bidang_keahlian`, pivot `dosen_keahlian`, `pengaturan_sistem`, `password_reset_requests`, `biodata_change_requests`, `keahlian_change_requests`, `log_aktivitas` dan `log_super_admin`. ID, kolom lama/baru, flag perubahan, JSON keahlian, status, arsip dan timestamp sumber dipertahankan. ID dalam JSON baru ditulis sebagai string desimal. FK histori permohonan memakai RESTRICT untuk mempertahankan hubungan sumber.

Pembacaan source lengkap mencakup migration 5 Oktober, 19 Oktober dan cleanup 5 November 2026, model Pengguna/Mahasiswa/Dosen, Register, AccountValidationService, ForgotPassword, AccountApproval, AccountManagement, EditProfile, TambahAkun, KelolaAkun, PenetapanPeran, PengaturanSistem, route dan middleware akun.

Soft delete mengosongkan kredensial aktif dan menyimpan arsip. Status akun sumber tetap terpisah dari `deleted_at`. Restore mengembalikan arsip persis terlebih dahulu, kemudian nilai aktif historis dengan memangkas hanya suffix terminal `.deleted.<angka>` untuk email atau `_DEL_<angka>` untuk NIM/NIDN. Identitas hasil pemulihan diperiksa terhadap seluruh kredensial yang masih ditempati. Audit menyimpan snapshot sebelum/sesudah dan versi transformasi `archive-verbatim-or-terminal-active-suffix-v2`; audit v1 yang sudah tersimpan tetap dipertahankan. Konflik membatalkan transaksi penuh. Nilai aktif dan arsip yang berbeda tetap terekam dalam audit.

Cleanup 5 November memakai query builder dan mengisi `nonaktif`/`deleted_at` pada admin keuangan tanpa event pengarsipan model. Register dan validator pendaftaran masih menerima admin keuangan, route keuangan masih ada, serta KelolaAkun masih dapat memulihkan/mengaktifkannya. TASK-003 mempertahankan operasi identitas tersebut. Menu tambah akun superadmin dan PenetapanPeran mengikuti pilihan mahasiswa/dosen/kaprodi/sekpro yang ditampilkan source. Modul pembayaran berada pada tahap akademik lanjutan.

Keputusan tahap rebuild mempertahankan profil historis ketika peran berubah agar hubungan dan ID migrasi tetap tersedia. Source PenetapanPeran menghapus profil/data peran lama secara permanen. Penyesuaian relasi judul/bimbingan/sempro dan guard penugasan dosen harus diintegrasikan saat modul tersebut ditambahkan. Pada schema tahap ini tabel penugasan akademik belum tersedia.

### Transaksi dan otorisasi

Setiap mutasi memeriksa Origin. Mutasi publik memakai limiter PostgreSQL fondasi dengan namespace identitas tersendiri. Mutasi akun memakai advisory transaction lock per program studi, kemudian row lock pengguna. Otorisasi dibaca ulang dari pengguna dan sesi tersimpan yang dikunci, termasuk status, expiry, `auth_version`, wajib ganti password dan mode peran terkini. Keunikan database tetap menjadi lapisan akhir untuk konflik dengan penulis lain.

Audit dan perubahan bisnis memakai transaksi yang sama. Superadmin juga menghasilkan catatan `log_super_admin`. Sesi dicabut pada reset, perubahan email, status, delete/restore dan penetapan kewenangan. Heartbeat dan timeout sesi fondasi dipertahankan.

Kolom `password_reset_requests.token` mempertahankan data sumber untuk impor. Konsumsi reset baru memakai `token_hash` dan versi autentikasi. Token legacy yang tersimpan plaintext memerlukan permohonan persetujuan baru pada aplikasi ini.

### Perbaikan temuan TASK-008 melalui TASK-010

- **Encoding E2E, cacat terkonfirmasi:** file UTF-8 dibaca runner Windows sebagai mojibake pada en-dash. `accounts-guest.yaml` kini menyimpan assertion teks lengkap dalam scalar YAML double quote dengan escape ASCII `\u2013`. Teks produk dan seluruh 23 langkah tetap sama. Regresi layanan registrasi membuktikan semester 7 dan 14 diterima sesuai NIM/periode manual, serta menolak 6, 15, paritas dan pilihan yang tidak cocok.
- **Lock, pekerjaan tidak perlu terkonfirmasi:** identitas reset yang tidak cocok, ambigu, tidak aktif atau milik superadmin sebelumnya tetap masuk advisory lock `736427003`. Token reset acak/kedaluwarsa juga melewati hashing dan masuk lock. Preflight kini menolak kasus tersebut sebelum lock; token tidak memenuhi syarat juga ditolak sebelum bcrypt. Pencarian identitas/pemilik dan token diulang di dalam lock. Identity transfer saat menunggu tidak mengarahkan permohonan ke pemilik baru. Registrasi dan reset sejak awal sudah melakukan bcrypt di luar lock. Lock bersama untuk semua mutasi akun, cek aktor/pengguna/sesi, konflik identitas dan transfer Kaprodi tetap dipertahankan; tidak ada klaim pengukuran contention PostgreSQL.
- **Suffix, cacat arsip terkonfirmasi:** fungsi lama memangkas suffix dari arsip maupun nilai aktif. `skripsi/app/Models/Pengguna.php::restoring` mengembalikan arsip persis, sedangkan migration Laravel `2026_10_05_070000_release_deleted_users_credentials.php` menambahkan suffix ke kolom aktif. Patch memisahkan kedua sumber itu. Regresi mencakup arsip literal dengan penanda mirip suffix, substring nonterminal, NIM/NIDN nullable, konflik email/NIM/NIDN dan profil historis yang tetap tersimpan saat peran berubah. Identitas aktif terminal legacy tetap dipulihkan dengan aturan kompatibilitas sebelumnya; impor tetap perlu memastikan provenance nilai aktif tersebut.
- **Constraint token, laporan redundansi tidak terbukti:** `AuthSession.tokenHash @id` cocok dengan `auth_sessions_pkey` pada migration `20261107000000_identity_auth`; tidak ada unique index token_hash tambahan di tabel itu. `PasswordResetRequest.tokenHash String? @unique` cocok dengan kolom nullable dan unique index `password_reset_requests_token_hash_key` pada migration `20261107010000_accounts_settings`. Kedua constraint melindungi tabel dan kegunaan berbeda. Unique `token` plaintext juga mempertahankan kontrak legacy pada kolom berbeda. Schema dan SQL tidak diubah.
- **Cookie/origin, perilaku keamanan yang diharapkan:** produksi menolak `APP_ORIGIN` HTTP. Regresi dengan cookie store/header sintetis membuktikan nama `__Host-sias_session`, `Secure`, `HttpOnly`, `SameSite=Lax`, path `/`, tanpa Domain, cookie sesi biasa tanpa expiry, expiry remember dan atribut penghapusan. Origin hilang/asing, HTTP dan port berbeda ditolak. Deploy harus memakai HTTPS dari browser, proxy mengakhiri TLS, dan `APP_ORIGIN=https://<host-publik>` sesuai origin publik. Untuk HTTP lokal gunakan `npm run dev`, bukan `npm start`; jangan menonaktifkan guard atau menurunkan keamanan cookie. Pengujian ini belum membuktikan penerimaan cookie oleh browser pada deployment HTTPS nyata.

Verifikasi aktual 7 November 2026: `npm ci` (510 paket, nol vulnerability), Prisma generate/validate, lint, typecheck, production build dan 60 test lulus. Empat regresi baru gagal pada source sebelum patch (laporan Node menghitung 5 failure termasuk test induk); sesudah patch semuanya lulus. Adapter transaksi tetap simulasi mutex/rollback dan interleaving, bukan transaksi PostgreSQL nyata.

LSP akhir melaporkan tanpa error untuk `policy.ts`, `reset.ts` dan `tests/session.test.ts`. `management.ts` dan `tests/accounts.test.ts` timeout saat pemeriksaan akhir serta satu retry; test akun sempat memperoleh hasil tanpa error pada pemeriksaan awal. Error readonly `delete NODE_ENV` di test cookie sudah diperbaiki dan file itu memperoleh hasil tanpa error. Tidak mengklaim LSP menyeluruh lulus; typecheck dan build final tetap lulus.

Flow accounts tervalidasi inline: 23 langkah, nol diagnostik. Validator file menolak path worktree tersembunyi dengan `escapes every e2e/ directory`; suite terdeteksi menunjuk checkout utama, sehingga flow accounts yang telah dipatch belum dapat dirun tanpa dukungan worktree runner. Tidak menyalin patch ke checkout utama atau mengulang flow lama yang masih mengandung masalah encoding. Riwayat diperiksa sebelum eksekusi; tidak ada heal accounts baru. Rerun sesudah Merge perlu memakai flow yang telah dipatch. `auth-guest` lulus 18/18 pada development server worktree port 3102 tanpa konfigurasi database/secret (run `eb30b4d0-7b3c-4b69-b2b9-4a7ddff8ac4a`). Ini bukti guard tamu dan pesan layanan tidak tersedia, bukan login berhasil. Pemeriksaan HTTP `/login` dan `/register` menghasilkan 200 dan label semester lengkap tetap ada di HTML.

Server development worktree port 3102 sudah dihentikan setelah verifikasi. Tool `database_*`, termasuk `database_list_sources`, tidak tersedia di sesi TASK-010; status sources terkini tidak dapat dipanggil ulang. Tidak ada koneksi, seed, migrasi atau perubahan database nyata. Concurrency/constraint PostgreSQL, alur pengguna terautentikasi dan cookie browser HTTPS tetap memerlukan environment serta persetujuan data yang sesuai.

### Verifikasi TASK-003 pada 7 November 2026

- `npm ci`, `npm run prisma:generate`, `npm run prisma:validate`, `npm run typecheck`, `npm run lint`, `npm test`, dan `npm run build` berhasil. Instalasi melaporkan nol kerentanan. Suite memuat 53 test termasuk subtest, mencakup seluruh 26 test fondasi.
- Tindak lanjut review mengunci submit formulir setelah menghasilkan token reset atau password sementara, termasuk setelah rahasia disembunyikan. Regresi komponen memakai hook React sintetis untuk memeriksa state kontrol dan visibilitas rahasia. Review terarah memeriksa potongan layanan otorisasi, transaksi, reset dan formulir. Pemeriksaan commit utuh oleh reviewer belum tuntas.
- Regresi terarah memakai database/sesi sintetis dan pemanggilan service/Server Action aktual. Mutex serta rollback adapter hanya mensimulasikan kontrak transaksi PostgreSQL. Kasus mencakup approval/restore bersamaan, rollback massal, konflik email/NIM/NIDN, suffix legacy, arsip dipakai ulang, cleanup keuangan, role transfer, reset sekali pakai/kedaluwarsa, snapshot stale, pencabutan sesi, Origin dan penyimpanan audit tanpa rahasia.
- Pemeriksaan HTTP development tanpa database menghasilkan 200 untuk `/login`, `/register`, `/lupa-password`. `/akun`, `/akun/baru`, `/akun/permohonan`, `/profil` dan `/pengaturan` mengarahkan guest ke `/login`.
- `e2e/accounts-guest.yaml` lulus validasi inline dengan 23 langkah. Validator berbasis file menolak path `.sokudo/worktrees/...` dengan pesan `escapes every e2e/ directory`. Flow fondasi yang terdeteksi lulus validasi file, tetapi `e2e_run` gagal karena panel/tab browser workspace tidak tersedia. Browser E2E belum terlaksana.
- PostgreSQL nyata, penerapan kedua SQL, browser alur pengguna aktif dan cookie produksi memerlukan environment yang disetujui. Tool database Sokudo tidak tersedia pada sesi worker ini. Seluruh pengujian database pada suite merupakan simulasi dalam memori.
- LSP dipanggil untuk seluruh source yang berubah. Halaman, navigasi, beberapa helper dan schema Prisma melaporkan tanpa error. Sebagian file TypeScript mengalami timeout diagnostik meski telah diulang. LSP juga masih menampilkan cache duplikasi dari salinan schema sementara yang sudah dihapus. Validasi Prisma, typecheck dan lint pada file aktual berhasil. Pemeriksaan LSP menyeluruh belum dapat disahkan.
