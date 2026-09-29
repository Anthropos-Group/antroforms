"use client";

import { useEffect, useState } from "react";

function haceCuanto(iso) {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "hace menos de un minuto";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return `hace ${h} h ${min % 60} min`;
}

// Estado de la copia local de clientes (refresco automático cada pocos minutos)
// y botón para forzar una pasada ya, p. ej. justo después de subir clientes a Twenty.
export default function RefrescoClientes() {
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState("");

  async function cargar() {
    try {
      const res = await fetch("/api/admin/refrescar-clientes");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setEstado(d);
      setError("");
      return d;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, []);

  async function refrescarAhora() {
    setError("");
    const res = await fetch("/api/admin/refrescar-clientes", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error || `Error ${res.status}`);
      return;
    }
    setEstado((e) => ({ ...(e || {}), enCurso: true }));
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const nuevo = await cargar();
      if (nuevo && !nuevo.enCurso) break;
    }
  }

  const ultimo = estado?.ultimo;
  return (
    <div className="card pad" style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <strong>Copia local de clientes</strong>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            Se actualiza sola cada 10 minutos leyendo de Twenty lo que cambió (altas, estados, mes de gestión).
            {estado && (
              <>
                {" "}Última actualización: <strong>{haceCuanto(estado.actualizado_en)}</strong>
                {ultimo?.ok && ` · ${ultimo.leidos} clientes leídos en ${ultimo.segundos}s`}
                {ultimo && !ultimo.completo && ultimo.ok && " · quedaron registros por leer"}
              </>
            )}
          </div>
          {ultimo && ultimo.ok === false && (
            <div style={{ fontSize: 13, color: "#991b1b", marginTop: 4 }}>Último intento falló: {ultimo.error}</div>
          )}
          {error && <div style={{ fontSize: 13, color: "#991b1b", marginTop: 4 }}>{error}</div>}
        </div>
        <button className="btn" disabled={estado?.enCurso} onClick={refrescarAhora}>
          {estado?.enCurso ? "⏳ Actualizando…" : "🔄 Actualizar clientes ahora"}
        </button>
      </div>
    </div>
  );
}
