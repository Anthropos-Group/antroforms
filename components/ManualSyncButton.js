"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_MS = 3000;
const MAX_ESPERA_MS = 30 * 60 * 1000;

export default function ManualSyncButton() {
  const [ejecutando, setEjecutando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const router = useRouter();

  // Consulta el avance de la corrida (que sigue en el servidor en segundo plano)
  // hasta que termine. Si el navegador se cierra, la corrida no se interrumpe.
  async function esperarCorrida(id) {
    const inicio = Date.now();
    while (Date.now() - inicio < MAX_ESPERA_MS) {
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
      let run;
      try {
        const res = await fetch(`/api/admin/sync-runs/${id}`);
        run = await res.json();
        if (!res.ok) throw new Error(run.error || `Error ${res.status}`);
      } catch {
        continue; // corte de red momentáneo: se vuelve a consultar
      }
      if (run.estado !== "en_progreso") return run;
      setMensaje({
        tipo: "info",
        texto: `Sincronizando… ${run.registros_escaneados ?? 0} revisados, ${run.registros_modificados ?? 0} con cambios, ${run.errores ?? 0} errores.`,
      });
    }
    return null;
  }

  async function dispararSync(modo) {
    if (ejecutando) return;
    setEjecutando(true);
    setMensaje({ tipo: "info", texto: `Iniciando limpieza (${modo}) contra Twenty CRM…` });

    try {
      const res = await fetch(`/api/cron/sync-twenty?modo=${modo}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Error del servidor (${res.status})`);
      }

      const run = data.sync_run_id ? await esperarCorrida(data.sync_run_id) : data;
      if (!run) {
        setMensaje({
          tipo: "info",
          texto: "La sincronización sigue corriendo en el servidor. Revisa el historial en unos minutos.",
        });
      } else if (run.estado === "fallido") {
        throw new Error(run.detalle?.split("\n")[0] || "la corrida terminó con error");
      } else {
        setMensaje({
          tipo: "success",
          texto: `✓ Limpieza finalizada: ${run.registros_escaneados} escaneados, ${run.registros_modificados} actualizados, ${run.errores} errores.${
            run.parcial ? " Quedaron registros por revisar: se retoman en la próxima corrida." : ""
          }`,
        });
      }
      router.refresh();
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: `✕ Falló la sincronización: ${err.message}`,
      });
      router.refresh();
    } finally {
      setEjecutando(false);
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          className="btn btn-primary"
          disabled={ejecutando}
          onClick={() => dispararSync("incremental")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {ejecutando ? "⏳ Sincronizando…" : "🚀 Ejecutar Limpieza Incremental"}
        </button>

        <button
          className="btn"
          disabled={ejecutando}
          onClick={() => dispararSync("dry_run")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          🔍 Probar Limpieza (Dry Run)
        </button>

        {ejecutando && (
          <span style={{ fontSize: 13, color: "#4f46e5", fontWeight: 500 }}>
            Procesando lotes en Twenty CRM, por favor espera…
          </span>
        )}
      </div>

      {mensaje && (
        <div
          style={{
            marginTop: 10,
            padding: "8px 14px",
            borderRadius: 6,
            fontSize: 13,
            background:
              mensaje.tipo === "success"
                ? "#ecfdf5"
                : mensaje.tipo === "error"
                ? "#fef2f2"
                : "#eff6ff",
            color:
              mensaje.tipo === "success"
                ? "#065f46"
                : mensaje.tipo === "error"
                ? "#991b1b"
                : "#1e40af",
            border: `1px solid ${
              mensaje.tipo === "success"
                ? "#a7f3d0"
                : mensaje.tipo === "error"
                ? "#fecaca"
                : "#bfdbfe"
            }`,
          }}
        >
          {mensaje.texto}
        </div>
      )}
    </div>
  );
}
