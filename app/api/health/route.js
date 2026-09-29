import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

// Healthcheck para Docker/Portainer y monitoreo externo (público, sin datos sensibles).
export async function GET() {
  const inicio = Date.now();
  try {
    await getPool().query("select 1");
    return NextResponse.json({ ok: true, db: "ok", ms: Date.now() - inicio });
  } catch (err) {
    console.error("Healthcheck: base de datos no disponible:", err.message);
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
