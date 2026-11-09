-- Existing identities, pivots and JSON references remain untouched and unmapped.
ALTER TABLE "bidang_keahlian" ADD COLUMN "program_studi_id" BIGINT;
ALTER TABLE "bidang_keahlian" ADD CONSTRAINT "bidang_keahlian_program_studi_id_fkey"
  FOREIGN KEY ("program_studi_id") REFERENCES "program_studi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "bidang_keahlian_nama_bidang_key";
-- nama_bidang remains CITEXT, including in this compound unique index.
CREATE UNIQUE INDEX "bidang_keahlian_program_studi_id_nama_bidang_key"
  ON "bidang_keahlian"("program_studi_id", "nama_bidang");

-- A mapped identity cannot silently acquire a different historical meaning.
CREATE FUNCTION protect_expertise_program() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.program_studi_id IS NOT NULL AND NEW.program_studi_id IS DISTINCT FROM OLD.program_studi_id THEN
    RAISE EXCEPTION 'Mapped expertise cannot change program';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER expertise_program_immutable BEFORE UPDATE OF program_studi_id ON bidang_keahlian
  FOR EACH ROW EXECUTE FUNCTION protect_expertise_program();
