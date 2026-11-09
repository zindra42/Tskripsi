# Fakultas, prodi dan Dekan

## Penerapan dan transisi

Patch menyediakan tiga migration berurutan: `20261108160000_dekan_role`, `20261108160100_organization`, dan `20261108160200_leadership_invariants`. Perubahan enum dipisah karena PostgreSQL harus melakukan commit sebelum nilai enum baru dipakai. Review SQL dan backup sesuai prosedur operator sebelum deployment yang disetujui pemilik. Worker tidak menerapkan migration, seed atau importer pada database nyata.

1. Setelah migration disetujui dan diterapkan operator, masuk sebagai superadmin. Buka `/organisasi`; buat fakultas, lalu prodi dengan kode, nama, jenjang dan status aktif. Kode fakultas unik global; kode prodi dan pasangan nama/jenjang unik dalam fakultas, tanpa membedakan kapital.
2. Buka `/organisasi/afiliasi`. Cari nama atau ID akun, periksa profil mahasiswa/dosen dan label lamanya, lalu pilih fakultas/prodi berdasarkan bukti administrasi. Profil terhapus dan kedua profil historis akun tetap dapat ditautkan secara terpisah. Tidak ada pemetaan otomatis berdasarkan nama.
3. Penautan profil pimpinan yang belum terpetakan mencabut flag/jabatan legacy dan sesinya. Tetapkan kembali pejabat yang benar melalui tata kelola. Untuk memindahkan profil pimpinan yang sudah terpetakan, berhentikan jabatan lebih dahulu. Penugasan pembimbing/penguji dan snapshot lama tidak dihapus atau dihitung ulang.
4. Pada fakultas, pilih dosen aktif untuk menetapkan/mengganti Dekan. Calon Dekan dapat berasal dari dosen atau pimpinan yang memiliki profil dosen; profil tersebut dipertahankan, tetapi jabatan prodi dicabut. Penggantian/pemberhentian mengembalikan Dekan lama ke dosen. Dekan masuk ulang dan memperoleh `/dashboard/dekan` serta `/organisasi` untuk fakultas yang ditetapkan.
5. Pada kartu prodi, pilih jabatan Kaprodi/Sekpro, pengganti, dan alasan. Pilihan kosong berarti pemberhentian. Calon harus dosen aktif, tidak terhapus, dan mempunyai ID master prodi yang sama. Satu dosen dapat memegang kedua jabatan seperti kebijakan sebelumnya; rotasi salah satu tidak mencabut jabatan lainnya.
6. Untuk menonaktifkan prodi, berhentikan kedua pimpinannya dahulu. Untuk menonaktifkan fakultas, nonaktifkan semua prodi dan berhentikan Dekan dahulu. Tidak tersedia penghapusan master atau pemindahan fakultas sebuah prodi yang akan mengubah afiliasi seluruh anggotanya secara tersembunyi.

Registrasi publik tetap mahasiswa/dosen/admin keuangan; Dekan bukan pilihan publik. Jabatan Sekpro baru ditetapkan melalui tata kelola setelah akun dosen aktif, bukan flag yang diajukan sendiri. Pembuatan langsung Kaprodi/Sekpro oleh superadmin tetap tersedia dan memeriksa slot prodi yang sama. Koreksi profil, permohonan perubahan afiliasi dan role baru memakai pilihan master; perpindahan lintas prodi melalui permohonan memerlukan keputusan superadmin. Tindakan melalui ID palsu, prodi/fakultas nonaktif atau sesi lama ditolak server.

## Batas otorisasi

- Superadmin mengelola seluruh organisasi. Dekan hanya mengelola prodi dan jabatan dalam fakultas aktifnya. Dekan tanpa penempatan menerima keadaan kosong dan tidak memperoleh akses global.
- Kebijakan tata kelola terpisah dari `canManage`, sehingga Dekan tidak mendapat reset/approval akun, approval judul, penjadwalan, penilaian, koreksi proses, audit global, keuangan atau pengaturan. Profil/penugasan dosen historis tidak memberikan peran dosen kepada Dekan.
- Kaprodi/Sekpro memerlukan afiliasi master aktif. Nama sama di fakultas berbeda tidak cocok; null tidak menjadi wildcard. Daftar/pencarian/detail akun, permohonan akun, judul, proposal privat, penetapan/pembatalan pembimbing dan keputusan perubahan judul menggunakan ID master. Pembimbing yang sudah ditugaskan tetap dapat membaca histori melalui izin penugasan yang sah.
- Mutasi memakai transaksi dan advisory lock akun yang sama (`736427003`), row/session checks terkini, unique index jabatan per prodi, serta deferred constraint trigger pada akun/profil/master. Trigger memeriksa entitas yang terdampak. Audit menyimpan aktor, alasan, before/after. Sesi dan reset link terdampak dicabut ketika role, jabatan, afiliasi atau master berubah.
- Kolom `prodi` lama tetap ada sebagai label kompatibilitas dan disinkronkan saat penautan/perubahan nama. Importer tetap mempertahankan data sumber, ID, arsip, snapshot dan flag yang belum terpetakan. FK master baru tetap null pada impor; katalog target diperbarui tanpa menambahkan tabel master fiktif pada graf impor legacy. Lakukan impor legacy ke target kosong sebelum menyiapkan master dan pemetaan; importer memang menolak target yang sudah terisi.

## Monitoring

`/dashboard/dekan` dan `/monitoring` membaca data dalam fakultas tersimpan. Superadmin memilih fakultas dahulu, kemudian filter prodi. Semua filter divalidasi server. Prodi nonaktif dapat dipantau untuk histori; hal ini tidak memberi izin penugasan baru. Dekan pada fakultas nonaktif tidak mendapat data.

Populasi adalah mahasiswa aktif, tidak terhapus, yang terpetakan dalam cakupan. Tahapan bersifat eksklusif dari pengajuan resmi terbaru yang tidak diarsipkan/dihapus/dibatalkan dan siklus yang sama: belum mengajukan, judul, bimbingan, sempro, sidang, selesai. Sempro yang lulus dan revisinya selesai kembali ke bimbingan skripsi sampai pendaftaran sidang resmi. Selesai mengikuti predicate hasil resmi/revisi yang dipakai domain sidang, termasuk kompatibilitas hasil legacy.

Revisi terlambat menghitung proses sempro/sidang resmi yang lulus revisi, belum selesai, dan tenggat tanggalnya sebelum hari ini di WITA. Beban dosen menghitung penugasan pembimbing 1/2 pada judul aktif milik mahasiswa dalam cakupan, sesuai predicate kuota aplikasi; satu bimbingan hanya sekali per dosen. Ini bukan total penugasan di luar cakupan. Tidak dibuat rasio KTW/risiko DO. Respons mahasiswa hanya agregat; query tidak memilih nama, berkas, hash, token, nilai atau snapshot privat mahasiswa.

## Bidang keahlian per prodi (TASK-019)

Migration `20261109000000_expertise_program` menambahkan FK prodi nullable pada bidang dan mengganti unique nama global dengan pasangan ID prodi/nama CITEXT. Nama prodi identik pada fakultas berbeda tetap terisolasi. Seluruh bidang lama tetap berprodi null, beserta ID, pivot, matriks, draft dan permohonannya. Importer mengisi kolom sumber seperti sebelumnya dan membiarkan afiliasi baru null.

Sesudah penerapan migration oleh operator yang disetujui pemilik, superadmin membuka `/pengaturan`, memilih fakultas/prodi aktif untuk bidang baru, atau memakai kartu pemetaan bidang legacy. Penautan memeriksa pivot dosen, kedua kolom bidang judul/perubahan, seluruh baris matriks lama/baru, draft dan kedua daftar keahlian pada permohonan. Referensi prodi lain atau profil belum terpetakan menggagalkan transaksi. Petakan profil berdasarkan bukti administrasi terlebih dahulu. Untuk bidang legacy yang dipakai lintas prodi, pertahankan identitas tersebut dan buat master baru per prodi. Penautan diaudit dan prodi bidang yang sudah dipetakan bersifat tetap.

Pilihan baru hanya memakai bidang terpetakan pada prodi dan fakultas aktif. Registrasi, bidang lainnya, profil/approval, judul/draft serta persetujuan perubahan memeriksa ulang ID terhadap afiliasi tersimpan. Form mereset pilihan ketika prodi tujuan berubah. Pivot dari afiliasi lama tetap tersimpan dan disaring dari pilihan/grant aktif serta rekomendasi. Opsi publik hanya mengirim ID/nama bidang dan ID prodi.

Pengujian TASK-019 memakai adapter sintetis, termasuk keunikan case-insensitive, bigint, rollback pemetaan/registrasi, permohonan lama dan pergantian afiliasi. Eksekusi migration/index/trigger di PostgreSQL serta pemetaan dan formulir terautentikasi pada data uji masih memerlukan lingkungan yang disetujui pemilik.

## Verifikasi patch

Layanan diuji dengan fixture dan database sintetis: isolasi fakultas/prodi bernama sama, null, ID bigint, spoof ID/filter, sesi kedaluwarsa/mode sesi tersimpan, dosen historis pada Dekan, mutasi master, pemetaan, rotasi dua jabatan, jalur superadmin lama, preservasi histori dan penghitungan tahap/tenggat WITA. Rehearsal importer sintetis memeriksa rollback/restart/reimport, 51 tabel sumber, 54 row, 53 tahap dan delapan entri berkas. Ini bukan bukti eksekusi SQL PostgreSQL atau alur login Dekan pada database nyata.

Jalankan `npm run prisma:generate`, `npm run prisma:validate`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, dan `npm run migration:rehearsal`. Validasi `e2e/dekan-guest.yaml` melalui Sokudo sebelum dijalankan sesudah Merge. Runtime uji PostgreSQL untuk unique index/trigger, UI terautentikasi dua fakultas, rotasi bersamaan pada koneksi nyata, dan login ulang sesi yang dicabut masih perlu dilakukan pada lingkungan uji yang disetujui pemilik.
