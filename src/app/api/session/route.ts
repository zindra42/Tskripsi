import { z } from "zod";
import { hasTrustedOrigin } from "@/lib/auth/origin";
import { currentTokenHash, getSession } from "@/lib/auth/session";
import { database } from "@/lib/db";

export async function POST(request: Request) {
  if (!await hasTrustedOrigin()) return Response.json({ error: "Permintaan tidak diizinkan." }, { status: 403 });
  try {
    const session = await getSession();
    if (!session) return Response.json({ error: "Sesi berakhir." }, { status: 401 });
    if (session.publicId !== request.headers.get("X-SIAS-Session")) {
      return Response.json({ error: "Sesi telah berubah. Muat ulang halaman." }, { status: 409 });
    }
    return Response.json({ status: "alive" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Layanan sesi belum tersedia." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!await hasTrustedOrigin()) return Response.json({ error: "Permintaan tidak diizinkan." }, { status: 403 });
  const expectedId = z.uuid().safeParse(request.headers.get("X-SIAS-Session"));
  if (!expectedId.success) return Response.json({ error: "Identitas sesi tidak valid." }, { status: 400 });
  try {
    const hash = await currentTokenHash();
    if (!hash) return Response.json({ error: "Sesi telah berubah." }, { status: 409 });
    const ended = await database().authSession.deleteMany({
      where: { tokenHash: hash, publicId: expectedId.data, remember: false },
    });
    if (ended.count !== 1) return Response.json({ error: "Sesi telah berubah." }, { status: 409 });
    // Login/logout own cookie rotation so a delayed timeout response cannot clear a newer cookie.
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "Layanan sesi belum tersedia." }, { status: 503 });
  }
}
