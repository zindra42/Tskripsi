-- Additive only. No legacy affiliations or flags are inferred or rewritten.
CREATE TABLE fakultas (
  id BIGSERIAL PRIMARY KEY,
  kode CITEXT NOT NULL UNIQUE CHECK (length(kode) BETWEEN 2 AND 20 AND kode::text ~ '^[A-Za-z0-9.-]+$'),
  nama VARCHAR(100) NOT NULL CHECK (length(btrim(nama)) BETWEEN 3 AND 100),
  aktif BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE program_studi (
  id BIGSERIAL PRIMARY KEY,
  fakultas_id BIGINT NOT NULL REFERENCES fakultas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  kode CITEXT NOT NULL CHECK (length(kode) BETWEEN 2 AND 20 AND kode::text ~ '^[A-Za-z0-9.-]+$'),
  nama CITEXT NOT NULL CHECK (length(btrim(nama::text)) BETWEEN 3 AND 100),
  jenjang VARCHAR(10) NOT NULL CHECK (jenjang IN ('D1','D2','D3','D4','S1','S2','S3','Profesi')),
  aktif BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(fakultas_id, kode), UNIQUE(fakultas_id, nama, jenjang)
);
ALTER TABLE pengguna ADD COLUMN fakultas_id BIGINT REFERENCES fakultas(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX satu_dekan_aktif ON pengguna(fakultas_id)
  WHERE role = 'dekan' AND status_akun = 'aktif' AND deleted_at IS NULL;
ALTER TABLE mahasiswa ADD COLUMN program_studi_id BIGINT REFERENCES program_studi(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE dosen ADD COLUMN program_studi_id BIGINT REFERENCES program_studi(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX mahasiswa_program_studi_id_idx ON mahasiswa(program_studi_id);
CREATE INDEX dosen_program_studi_id_idx ON dosen(program_studi_id);
-- Historical unmapped flags remain intact; they grant no authority in application policy.
CREATE UNIQUE INDEX satu_kaprodi_per_prodi ON dosen(program_studi_id) WHERE is_kaprodi AND program_studi_id IS NOT NULL;
CREATE UNIQUE INDEX satu_sekpro_per_prodi ON dosen(program_studi_id) WHERE is_sekpro AND program_studi_id IS NOT NULL;
ALTER TABLE biodata_change_requests ADD COLUMN program_studi_lama_id BIGINT,
  ADD COLUMN program_studi_baru_id BIGINT, ADD COLUMN ubah_program_studi BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE keahlian_change_requests ADD COLUMN program_studi_lama_id BIGINT,
  ADD COLUMN program_studi_baru_id BIGINT, ADD COLUMN ubah_program_studi BOOLEAN NOT NULL DEFAULT false;
