-- AlterTable
ALTER TABLE "mahasiswa" ADD COLUMN IF NOT EXISTS "prodi" VARCHAR(100);

-- AlterTable
ALTER TABLE "dosen" ADD COLUMN IF NOT EXISTS "prodi" VARCHAR(100);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mahasiswa_prodi_idx" ON "mahasiswa"("prodi");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "dosen_prodi_idx" ON "dosen"("prodi");
