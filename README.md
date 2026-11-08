# SIAS — Sistem Informasi Administrasi Skripsi

![Next.js](https://img.shields.io/badge/Next.js-16.4.5-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19.3.1-blue?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3_Strict-3178C6?style=flat-square&logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-7.10.1-2D3748?style=flat-square&logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?style=flat-square&logo=postgresql)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3.5-38B2AC?style=flat-square&logo=tailwind-css)
![Automated Tests](https://img.shields.io/badge/Tests-npm%20test-success?style=flat-square)

Platform web modern terpadu untuk digitalisasi, pemantauan, dan percepatan seluruh siklus administrasi skripsi dan tugas akhir mahasiswa di lingkungan perguruan tinggi. Dibangun menggunakan arsitektur **Next.js App Router**, **TypeScript** (strict mode), **Prisma ORM**, dan **PostgreSQL**.

---

## 🌟 Gambaran Umum (Overview)

Pengelolaan administrasi tugas akhir dan skripsi sering menghadapi tantangan berupa fragmentasi berkas fisik, ketidakteraturan pencatatan bimbingan, jadwal ujian yang rawan bentrok, serta verifikasi keabsahan dokumen yang rentan pemalsuan.

**SIAS** mentransformasikan seluruh siklus tersebut ke dalam satu sistem terintegrasi dengan alur kerja digital yang transparan dan akuntabel:
- **Mahasiswa** dapat mengajukan judul dengan pengecekan kemiripan otomatis, mencatat sesi konsultasi secara interaktif, mendaftar seminar proposal hingga sidang skripsi.
- **Dosen Pembimbing & Penguji** dapat memvalidasi logbook, memberikan persetujuan (ACC), mengonfirmasi ketersediaan jadwal ujian, dan mengisi rubrik penilaian terbobot secara real-time.
- **Pimpinan Program Studi (Kaprodi & Sekpro)** dapat meninjau judul, menetapkan pembimbing berdasarkan keahlian dan kuota, menyusun jadwal bebas bentrok, serta mengesahkan berita acara kelulusan.
- **Dekan** mengelola prodi, menetapkan/merotasi Kaprodi dan Sekpro, serta memantau akademik dalam fakultasnya melalui `/organisasi` dan `/dashboard/dekan`.
- **Admin Keuangan & Staf Administrasi** memverifikasi bukti pembayaran dan berkas prasyarat akademik.
- **Publik / Pihak Ketiga** dapat memverifikasi keabsahan dokumen resmi (SK, Berita Acara, Lembar Pengesahan) melalui pemindaian QR code tanpa perlu login.

---

## 🚀 Fitur Utama

### 1. 👥 Manajemen Akun & Otorisasi Multi-Peran
- **Akses Berbasis Peran**: Mahasiswa, Dosen, Kaprodi, Sekretaris Prodi, Dekan, Admin Keuangan, dan Superadmin.
- **Pergantian Peran Dinamis (Role Switching)**: Pimpinan program studi dapat berpindah antara mode manajerial dan tugas pengajaran/pembimbingan dengan mulus.
- **Alur Persetujuan Registrasi & Reset Mandiri**: Registrasi akun bertingkat serta permohonan reset password berbasis persetujuan administrator dengan token sekali pakai yang aman.

Master fakultas/prodi memakai ID eksplisit. Superadmin menyiapkan fakultas, menempatkan Dekan dan menautkan profil lama melalui `/organisasi/afiliasi`; label prodi historis tidak memberi hak akses. Registrasi dan perubahan afiliasi memilih prodi aktif. Dekan tidak memperoleh hak approval akademik, penilaian, keuangan, reset akun atau pengaturan sistem. Petunjuk transisi dan batas verifikasi tersedia di [panduan organisasi](docs/organization.md).

### 2. 💡 Pengajuan Judul & Deteksi Kemiripan (NLP)
- **Analisis Kemiripan Judul Otomatis**: Memanfaatkan algoritma token similarity (Jaccard) terintegrasi dengan stemmer bahasa Indonesia (Sastrawi) untuk mendeteksi potensi duplikasi terhadap korpus judul skripsi terdahulu.
- **Rekomendasi Dosen Pembimbing**: Sistem mencocokkan bidang keahlian dosen dengan topik penelitian mahasiswa serta menyeimbangkan beban kuota bimbingan secara objektif.

### 3. 📝 Bimbingan & Logbook Konsultasi Terstruktur
- **Pencatatan Sesi Interaktif**: Mahasiswa dan dosen mencatat ringkasan materi, catatan perbaikan, dan tindak lanjut konsultasi.
- **Validasi Kuota Bimbingan**: Memastikan pemenuhan syarat minimal sesi konsultasi sebelum pembimbing dapat menerbitkan persetujuan (ACC) Seminar Proposal maupun Sidang Skripsi.

### 4. 🎓 Seminar Proposal & Sidang Skripsi
- **Pengecekan Prasyarat Bertingkat**: Validasi otomatis atas kelengkapan berkas administrasi, persetujuan pembimbing, dan pemenuhan syarat akademik.
- **Penjadwalan Bebas Bentrok**: Mesin penjadwalan cerdas mencegah *double-booking* ruangan dan bentrok waktu dosen.
- **Konfirmasi Penguji Paralel**: Sistem konfirmasi ketersediaan penguji secara paralel dengan opsi usulan jadwal alternatif.
- **Rubrik Penilaian Terbobot**: Formulir penilaian digital yang menghitung nilai akhir secara akurat sesuai bobot komponen institusi.

### 5. 🔏 Dokumen Resmi & Verifikasi QR Code Publik
- **Penerbitan Dokumen Digital**: Berita acara, undangan ujian, lembar persetujuan, dan bukti kelulusan diterbitkan dengan tanda tangan digital berbasis kriptografi (SHA-256).
- **Halaman Verifikasi Publik (`/verifikasi/[token]`)**: Memungkinkan pemangku kepentingan memvalidasi keaslian dokumen secara instan melalui pemindaian QR code.

---

## 🛠️ Arsitektur & Teknologi

| Lapisan / Komponen | Teknologi | Keterangan |
| :--- | :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) | Server Components & Server Actions terpadu |
| **UI Library** | [React 19](https://react.dev/) | Rendering modern dengan hooks reaktif |
| **Bahasa Pemrograman** | [TypeScript 5.9](https://www.typescriptlang.org/) | Strict type-safety end-to-end |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) & [Prisma 7.10](https://www.prisma.io/) | Relasi kuat, ekstensi `citext`, dan type-safe query |
| **Styling & Desain** | [Tailwind CSS v4](https://tailwindcss.com/) | Utilitas CSS modern dan responsif |
| **Pemrosesan Teks (NLP)** | TS-Sastrawi & Custom Stemmer | Normalisasi morfologi dan stemming bahasa Indonesia |
| **Keamanan Kredensial** | Argon2id & Bcrypt | Hashing password terstandarisasi industri |
| **Test Suite** | Node.js Native Test Runner (`node:test`) | Pengujian fungsional dan integritas domain |

---

## 📁 Struktur Direktori

```text
Tskripsi/
├── docs/                       # Dokumentasi arsitektur, panduan migrasi, dan catatan rilis
├── prisma/
│   ├── migrations/             # Riwayat migrasi skema PostgreSQL
│   └── schema.prisma           # Definisi skema relasional Prisma
├── public/                     # Aset publik statis (favicon, logo)
├── scripts/                    # Utilitas migrasi data, verifikasi oracle, dan pemeliharaan
├── src/
│   ├── app/                    # Next.js App Router (halaman, layout, Server Actions)
│   │   ├── (auth)/             # Login, register, pemulihan password
│   │   ├── administrasi/       # Pengajuan & verifikasi berkas administrasi
│   │   ├── akun/               # Manajemen akun pengguna & hak akses
│   │   ├── bimbingan/          # Jadwal & logbook konsultasi mahasiswa
│   │   ├── judul/              # Pengajuan judul & analisis kemiripan
│   │   ├── sempro/             # Pendaftaran, penjadwalan & ujian proposal
│   │   ├── sidang/             # Pendaftaran & penilaian sidang skripsi
│   │   └── verifikasi/         # Endpoint verifikasi publik dokumen via QR
│   ├── components/             # Komponen UI modular dan reusable
│   └── lib/                    # Logika bisnis inti, otorisasi, keamanan, dan helpers
└── tests/                      # Suite pengujian otomatis (unit & integrasi)
```

---

## 🏁 Panduan Memulai (Getting Started)

### Prasyarat Sistem
- **Node.js**: `v20.x` atau lebih baru (direkomendasikan Node `v26.x`)
- **NPM**: `v11.x` atau lebih baru
- **PostgreSQL**: `v15` atau lebih baru (dengan ekstensi `citext`)

### Langkah Instalasi

1. **Clone Repositori**:
   ```bash
   git clone https://github.com/zindra42/Tskripsi.git
   cd Tskripsi
   ```

2. **Instal Dependensi**:
   ```bash
   npm ci
   ```

3. **Konfigurasi Environment**:
   Salin berkas template lingkungan ke `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Sesuaikan variabel di dalam `.env.local`:
   - `DATABASE_URL`: URI koneksi PostgreSQL (contoh: `postgresql://user:pass@localhost:5432/sias?schema=public`)
   - `APP_ORIGIN`: URL aplikasi (misal: `http://localhost:3000` saat development)
   - `AUTH_RATE_LIMIT_SECRET`: String acak minimal 32 karakter untuk HMAC rate limiter
   - `SIAS_STORAGE_ROOT`: Direktori penyimpanan berkas lokal terisolasi

4. **Inisialisasi Skema Database**:
   ```bash
   npm run prisma:generate
   npm run prisma:validate
   ```

5. **Jalankan Development Server**:
   ```bash
   npm run dev
   ```
   Akses aplikasi melalui peramban di `http://localhost:3000`.

---

## 🧪 Pengujian & Kualitas Kode

Repositori ini menjaga keandalan fungsional melalui rangkaian pengujian otomatis dan pemeriksaan tipe yang ketat:

```bash
# Menjalankan seluruh pengujian unit & integrasi
npm test

# Memeriksa kepatuhan tipe TypeScript strict
npm run typecheck

# Memeriksa konsistensi gaya kode dengan ESLint
npm run lint

# Memvalidasi skema Prisma
npm run prisma:validate

# Membangun bundle aplikasi produksi
npm run build
```

---

## 🔒 Keamanan & Perlindungan Data

- **Autentikasi Server-Side**: Menggunakan token sesi berkekuatan 256-bit yang disimpan dalam bentuk digest SHA-256 dengan perlindungan cookie `__Host-`, `HttpOnly`, `SameSite=Lax`, dan `Secure`.
- **Penyimpanan Berkas Terisolasi**: Berkas sensitif (proposal skripsi, kwitansi pembayaran, bukti dokumen) disimpan di luar root web publik dan hanya dapat diakses melalui endpoint berotorisasi dengan verifikasi *magic bytes*.
- **Rate Limiting Terdistribusi**: Mencegah serangan brute-force pada endpoint autentikasi menggunakan pembatas berbasis HMAC IP/email.
- **Integritas Dokumen Kriptografis**: Salinan dokumen hasil ujian memuat tanda tangan hash SHA-256 yang divalidasi silang saat pemindaian QR code.

---

## 📚 Dokumentasi Terkait

Untuk pemahaman mendalam mengenai arsitektur internal, spesifikasi teknis modul, dan panduan migrasi data:
- [Panduan Migrasi Data & Rilis](docs/legacy-migration.md) — Prosedur cutover data dan rehearsal migrasi.
- [Kontrak Impor Data Sidang](docs/sidang-import-contract.md) — Pemetaan skema dan relasi pendaftaran sidang.
- [Catatan Paritas Modul Sidang](docs/task006-parity.md) — Rujukan perhitungan nilai dan verifikasi batas.
- [Katalog Skema Migrasi](docs/task007-migration.md) — Ringkasan relasi tabel dan indeks PostgreSQL.
- [Riwayat Verifikasi & Catatan Teknis Internal](docs/internal-verification-history.md) — Arsip detail pengerjaan tiket internal (TASK-001 s.d. TASK-010).

---

## 📄 Lisensi

Hak Cipta © 2026. Seluruh hak cipta dilindungi undang-undang.
Proyek ini dikembangkan untuk kebutuhan tata kelola administrasi akademik skripsi perguruan tinggi.
