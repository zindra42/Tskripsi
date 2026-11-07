# Kontrak impor historis sidang dan modul pendukung

Dokumen ini mendefinisikan masukan dan gate untuk TASK-007. TASK-006 tidak menjalankan importer, seed, migration nyata atau perubahan database sumber. SQL hanya boleh diterapkan melalui proposal `database_*` Sokudo yang disetujui pemilik.

## Masukan yang dipertahankan

- PK/FK bigint harus berupa string desimal pada ekspor dan `BigInt` saat pemetaan. Jangan melewati JavaScript Number. Batas target signed BIGINT adalah `9223372036854775807`; ID unsigned di atasnya menghentikan impor sampai ada keputusan schema. Siklus positif maksimal SMALLINT; versi jadwal harus positif. Preserve juga tanggal nullable dan timestamp sumber dalam interpretasi Asia/Makassar, terpisah dari timestamp autentikasi baru.
- Pertahankan identitas soft-delete, arsip kredensial, profil dosen/keuangan dan actor historis walau akun berganti peran/nonaktif. Import berdasarkan ID, bukan pencocokan email/NIM/NIDN. Cleanup keuangan memakai query builder dan dapat meninggalkan kredensial tanpa arsip model; jangan mengaktifkan akun itu saat impor.
- `pendaftaran_sidang`: seluruh periode/siklus, status draft/berkas, tanggal daftar/submit/verifikasi, dosen pembimbing sidang, IPK `Decimal(3,2)`, naskah/transkrip dan catatan. Tidak ada unique baru `(id_pengajuan,siklus_ke)` yang menghapus duplikasi sumber secara diam-diam; preflight melaporkan duplikasi untuk rekonsiliasi.
- `checklist_dokumen` dan `penugasan_penguji`: ID asli, kedua relasi sempro/sidang nullable, nomor item/slot, jenis, bentuk/status unggahan, berkas, reviewer, nilai/status historis, flag pengganti. Sempro dan sidang tidak boleh dipetakan berdasarkan nomor item saja. Butir pembayaran lama tetap histori; record baru memakai item 11 Penggandaan Skripsi. Tidak ada transformasi cleanup ulang atas semua row saat impor.
- `pembayaran_sidang`: seluruh row dan file kwitansi, transfer, KRS/SKA, pengirim, jumlah/tanggal/status, reviewer dan siklus. Tabel dipertahankan untuk pembacaan historis; bukan pemicu kelayakan sidang baru.
- Jadwal, konfirmasi, riwayat dan permohonan: setiap ID/versi, tanggal/jam/ruang WITA, status dan pelaku, slot JSON, alasan, active key dan snapshot dewan/periode. Jadwal legacy tanpa snapshot dewan tidak boleh diberi snapshot susunan dosen sekarang secara otomatis; butuh rekonsiliasi sebelum mutasi.
- Rubrik, penilaian, berita acara dan revisi: `Decimal(5,2)` nilai sebagai string, komponen/rubrik/snapshot mentah, metode bobot, saran/override/alasan, keputusan tiap tingkat, tenggat dan metadata versi/ukuran/path/persetujuan. Nilai akhir historis tidak dihitung ulang dengan rumus baru. Pertahankan metode `rekap_rata_rata` yang dimasukkan migration 27 Oktober bila itu nilai sumber.
- Hasil resmi legacy: gunakan `preserveLegacyDecision()` untuk menghasilkan `sourceHasil`, `sourceStatusPersetujuan` dan `transformProvenance`. `hasil`/`statusPersetujuan` tetap nilai sumber. Provenance memuat nama aturan, timestamp sumber, predicate hasil resmi dan `sourceUnchanged`; catat hash/versi ekspor serta waktu impor di manifest batch. Jangan menjalankan backfill Laravel lagi dan mengganti waktu approval dengan waktu impor.
- Dokumen: token persis (kapitalisasi termasuk), ID/FK, nomor surat dan alokasinya, semua versi/status, snapshot/hash nullable, nama/jabatan penandatangan, waktu/pelaku/alasan pencabutan, serta `digantikan_oleh_id`. Hash snapshot sumber tidak sama dengan hash byte PDF; keduanya perlu field manifest berbeda. Snapshot ACC retroaktif dapat menyimpan `file_acc_lama` walau tabel `dokumen_acc` sudah dihapus.
- Pengumuman, receipt baca, notifications UUID, notifikasi legacy dan audit: preserve status/target JSON (termasuk `sekprodi`), window tampil, pin, lampiran, marker kirim, data payload asli, actor dan timestamp. Normalisasi tautan ketika ditampilkan tidak menimpa payload impor.

## Urutan dan validasi

1. Validasi checksum/schema ekspor terkontrol dan ledger migration sumber sebelum membaca data. Tidak memuat `.env` Laravel atau menjalankan model hooks.
2. Impor referensi/pengaturan/rubrik/arsip, lalu seluruh pengguna/profil/pivot, administrasi, judul dan bimbingan/logbook/perubahan judul sesuai kontrak fondasi.
3. Impor sempro dengan `dispensasi_id` sementara null; impor dispensasi, lalu pulihkan referensi sempro–dispensasi dalam pass kedua. Jangan membuang siklus referensi ini.
4. Impor pendaftaran sidang, pembayaran historis, assignment/checklist, jadwal/konfirmasi/riwayat/permohonan, kemudian berita acara/penilaian/revisi. Actor soft-delete harus sudah ada.
5. Impor alokasi nomor surat dasar/kategori sebelum dokumen. Impor seluruh versi dokumen dengan pengganti sementara null, kemudian pulihkan self-reference pada pass kedua.
6. Impor pengumuman/baca/notifikasi/audit. Tidak mengirim ulang notifikasi dari hooks impor. Receipt runtime baru berbeda dari checkpoint impor dan tidak boleh dibuat dari data mahasiswa.
7. Jalankan `reconcileSidang()` pada ekspor sebelum proposal writes. Ia memeriksa rentang ID, PK ganda, siklus/versi, duplikasi judul-siklus, orphan kedua FK sidang, orphan jadwal, undangan dengan FK ganda/salah, status ambigu dan beberapa undangan aktif. Fungsi ini murni: tidak membuka koneksi atau mengubah row sumber. Ini pelengkap validasi ekspor menyeluruh, bukan validator semua kolom/tabel.
8. Orphan kedua `id_sidang_daftar` harus nol sebelum target memasang FK. SQL target secara eksplisit mengikat `checklist_dokumen.id_sidang_daftar` dan `penugasan_penguji.id_sidang_daftar` ke pendaftaran, meskipun source normal dapat tidak memiliki constraint fisik. Jangan menghapus orphan atau mengganti FK dengan null tanpa keputusan rekonsiliasi.
9. `id_jadwal` adalah sempro; `id_jadwal_sidang` adalah sidang. Undangan sidang berstatus sah yang tidak cocok jadwal/versi snapshot atau memiliki kedua FK masuk daftar rekonsiliasi. Import status sumber dan provenance; jangan mencabut atau mengesahkan massal berdasarkan asumsi bug source.
10. Setelah batch lengkap, rekonsiliasi jumlah row/PK/FK, aggregate desimal, siklus, hash JSON, token/nomor/versi/lifecycle, persetujuan dan manifest berkas. Reset sequence per tabel setelah ID eksplisit; hanya melalui proposal yang disetujui. Gunakan checkpoint/hash batch untuk mencegah duplikasi saat retry.

## Manifest storage dan URL

Setiap berkas memuat `sourceTable`, `sourcePk`, `sourceColumn` atau JSON pointer, disk `private`/`public`, path relatif, panjang byte, SHA-256 byte, MIME, versi dan URL legacy. Simpan kedua disk terpisah bila path sama. Loader target mencoba private kemudian public dengan pemeriksaan traversal/symlink; path lama tidak dipublikasikan sebagai direktori statis.

Pertahankan resolusi `/verifikasi/{token}`, `/sidang/checklist/file/{id}`, `/sidang/revisi-draft/{id}`, `/sempro/revisi-draft/{id}`, `/sidang/dokumen-terbit/{id}`, undangan/form/berita-acara/rekap sidang. `form_penilaian_sidang` legacy dan `form_nilai_sidang` target diterima sebagai alias baca. Untuk ACC dokumen-terbit, sumber mencari pengajuan dahulu lalu pendaftaran. Authorization unduhan tetap berlaku; QR publik hanya menampilkan status/identitas minimum.

Hostname lama yang sudah tercetak pada QR memerlukan konfigurasi cutover pemilik. URL langsung `/storage/...` dari source harus diinventarisasi dan dipetakan secara berotorisasi pada TASK-007; jangan membuka seluruh storage untuk membuat URL lama bekerja.

## Gate yang belum dijalankan

- Belum ada pembuktian penerapan SQL, FK runtime, transaksi lintas koneksi atau sequence PostgreSQL.
- Belum ada ekspor riil, manifest berkas riil, pencocokan jumlah/hash, dry-run importer atau rollback data.
- Belum ada UI E2E pengguna aktif dengan data PostgreSQL. Transaksi sintetis dan oracle PHP tidak menggantikan gate tersebut.
- Migration `20261107040000_sidang_support/migration.sql` dibungkus `BEGIN/COMMIT` dan cocok dengan delta datamodel lokal. Penerapan tetap menunggu proposal/approval database dan rekonsiliasi sebelumnya.
