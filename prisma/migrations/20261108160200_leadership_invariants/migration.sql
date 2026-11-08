-- Deferred cross-table guard: service rotations may clear flags and normalize a legacy
-- role in separate statements, but committed mapped leadership must be valid.
-- Existing UNMAPPED imports remain untouched and cannot authorize leadership.
CREATE FUNCTION check_organization_leadership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected_user BIGINT;
  affected_program BIGINT;
  affected_faculty BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(736427003);
  IF TG_TABLE_NAME = 'dosen' THEN affected_user := NEW.pengguna_id;
  ELSIF TG_TABLE_NAME = 'pengguna' THEN affected_user := NEW.id;
  ELSIF TG_TABLE_NAME = 'program_studi' THEN affected_program := NEW.id;
  ELSIF TG_TABLE_NAME = 'fakultas' THEN affected_faculty := NEW.id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM dosen d JOIN pengguna u ON u.id = d.pengguna_id
    JOIN program_studi p ON p.id = d.program_studi_id JOIN fakultas f ON f.id = p.fakultas_id
    WHERE (u.id = affected_user OR p.id = affected_program OR f.id = affected_faculty)
      AND (d.is_kaprodi OR d.is_sekpro OR u.role IN ('kaprodi', 'sekpro'))
      AND (u.deleted_at IS NOT NULL OR u.status_akun <> 'aktif'
        OR u.role NOT IN ('dosen', 'kaprodi', 'sekpro') OR NOT p.aktif OR NOT f.aktif
        OR (u.role = 'kaprodi' AND NOT d.is_kaprodi) OR (u.role = 'sekpro' AND NOT d.is_sekpro))
  ) THEN RAISE EXCEPTION 'Pimpinan prodi terpetakan harus dosen aktif pada prodi dan fakultas aktif' USING ERRCODE = '23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM pengguna u LEFT JOIN fakultas f ON f.id = u.fakultas_id
    WHERE (u.id = affected_user OR f.id = affected_faculty)
      AND u.role = 'dekan' AND u.deleted_at IS NULL AND u.status_akun = 'aktif'
      AND (f.id IS NULL OR NOT f.aktif)
  ) THEN RAISE EXCEPTION 'Dekan aktif memerlukan fakultas aktif' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER organisasi_dosen AFTER INSERT OR UPDATE ON dosen
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_organization_leadership();
CREATE CONSTRAINT TRIGGER organisasi_pengguna AFTER INSERT OR UPDATE ON pengguna
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_organization_leadership();
CREATE CONSTRAINT TRIGGER organisasi_prodi AFTER INSERT OR UPDATE ON program_studi
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_organization_leadership();
CREATE CONSTRAINT TRIGGER organisasi_fakultas AFTER INSERT OR UPDATE ON fakultas
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_organization_leadership();
