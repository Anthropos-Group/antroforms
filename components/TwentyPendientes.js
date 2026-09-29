"use client";

import { useEffect, useState } from "react";

export default function TwentyPendientes() {
  const [data, setData] = useState(null);
  const [reintentando, setReintentando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function cargar() {
    try {
      const res = await fetch("/api/admin/twenty-pendientes");
      const d = await res.json();
      if (res.ok) setData(d);
    } catch {
      // Se muestra vacío; la sección es informativa.
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function reintentar() {
    setReintentando(true);
    setMensaje(null);
    try {
      const res = await fetch("/api/admin/twenty-pendientes", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Error al reintentar");
      setMensaje({
        ok: d.fallidos === 0,
        texto: `${d.exitosos} actualizados en Twenty, ${d.fallidos} siguen fallando.`,
      });
      await cargar();
    } catch (err) {
      setMensaje({ ok: false, texto: err.message });
    } finally {
      setReintentando(false);
    }
  }

  if (!data) return null;
  const { pendientes, agotados, max_intentos } = data;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 className="section-title" style={{ margin: 0 }}>Cola de estados pendientes en Twenty</h2>
          <p className="section-subtitle" style={{ margin: "4px 0 0" }}>
            Cierres de encuesta (EFECTIVA / NO_LLAMAR) que Twenty no aceptó en el momento. Se reintentan en cada
            sincronización (hasta {max_intentos} veces).
          </p>
        </div>
        {pendientes.length > 0 && (
          <button className="btn btn-primary" onClick={reintentar} disabled={reintentando}>
            {reintentando ? "Reintentando…" : `Reintentar ahora (${pendientes.length})`}
          </button>
        )}
      </div>
      {mensaje && (
        <div style={{ padding: "0 16px 12px", fontSize: 13, color: mensaje.ok ? "#15803d" : "#991b1b" }}>{mensaje.texto}</div>
      )}
      {pendientes.length === 0 ? (
        <div className="empty-state">✓ No hay cambios de estado pendientes. Twenty está al día.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {agotados > 0 && (
            <div style={{ padding: "8px 16px", background: "#fef2f2", color: "#991b1b", fontSize: 13 }}>
              {agotados} registro(s) agotaron los reintentos automáticos: usa &quot;Reintentar ahora&quot; o revisa el error.
            </div>
          )}
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Estado a aplicar</th>
                <th>Intentos</th>
                <th>Último error</th>
                <th>Desde</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.cliente_nombre || <span className="mono">{p.cliente_twenty_id.slice(0, 8)}…</span>}
                    {p.codigo_cliente && <div style={{ fontSize: 12, color: "#6b7280" }}>Código {p.codigo_cliente}</div>}
                  </td>
                  <td><span className="badge badge-mode-incremental">{p.status_target}</span></td>
                  <td style={{ color: p.intentos >= max_intentos ? "#dc2626" : undefined }}>{p.intentos}</td>
                  <td className="mono" style={{ fontSize: 11.5, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis" }} title={p.ultimo_error || ""}>
                    {p.ultimo_error || "—"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>{new Date(p.creado_en).toLocaleString("es-EC")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
