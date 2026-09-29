"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ManualSyncButton() {
  const [ejecutando, setEjecutando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const router = useRouter();

  async function dispararSync(modo) {
    if (ejecutando) return;
    setEjecutando(true);
    setMensaje({ tipo: "info", texto: `Ejecutando limpieza (${modo}) contra Twenty CRM…` });

    try {
      const res = await fetch(`/api/cron/sync-twenty?modo=${modo}`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al ejecutar sincronización");
      }

      setMensaje({
        tipo: "success",
        texto: `✓ Limpieza finalizada: ${data.registros_escaneados} escaneados, ${data.registros_modificados} actualizados, ${data.errores} errores.${
          data.parcial ? " Quedaron registros por revisar: se retoman en la próxima corrida." : ""
        }`,
      });
      router.refresh();
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: `✕ Falló la sincronización: ${err.message}`,
      });
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
