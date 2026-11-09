import dotenv from "dotenv";
dotenv.config({ path: [".env.local", ".env"] });

import { database } from "../src/lib/db";
import { ensureSuperadmin, getSuperadminEnvConfig } from "../src/lib/auth/superadmin";

async function main() {
  const config = getSuperadminEnvConfig();
  if (!config) {
    console.error("Konfigurasi SUPERADMIN_EMAIL dan SUPERADMIN_PASSWORD belum diisi di .env / .env.local.");
    process.exit(1);
  }

  const db = database();
  const result = await ensureSuperadmin(db);
  if (!result) {
    console.error("Gagal melakukan sinkronisasi superadmin.");
    process.exit(1);
  }

  console.log(`Akun Super Admin berhasil disinkronkan: ${result.nama} <${result.email}> (ID: ${result.id.toString()})`);
  await db.$disconnect();
}

main().catch((err) => {
  console.error("Error sinkronisasi superadmin:", err);
  process.exit(1);
});
