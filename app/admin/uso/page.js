"use client";

import { useEffect, useState } from "react";

const COLOR = { ok: "#16a34a", atencion: "#f97316", critico: "#dc2626" };
const TEXTO_NIVEL = { ok: "Holgado", atencion: "Vigilar", critico: "Cerca del límite" };

function mb(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function Medidor({ titulo, usado, limite, porcentaje, nivel, detalle }) {
  return (
    <div className="card pad" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 className="section-title" style={{ margin: 0 }}>{titulo}</h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLOR[nivel] }}>{TEXTO_NIVEL[nivel]}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: "8px 0" }}>
        {usado} <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 500 }}>de {limite} · {porcentaje}%</span>
      </div>
      <div className="pdv-bar-track">
        <div className="pdv-bar-fill" style={{ width: `${Math.min(100, porcentaje)}%`, background: COLOR[nivel] }} />
      </div>
      {detalle && <p style={{ margin: "10px 0 0", fontSize: 13, color: "#4b5563" }}>{detalle}</p>}
    </div>
  );
}

export default function UsoSupabasePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/uso")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        setData(d);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="container"><div className="validation-box">⚠️ {error}</div></div>;
  if (!data) return <div className="container">Cargando uso de Supabase…</div>;

  const { baseDatos, conexiones, actividad, plan, tablas } = data;
  const meses = baseDatos.mesesRestantes;

  return (
    <div className="container">
      <h1 className="page-title">Uso de Supabase</h1>
      <p className="page-subtitle">
        Plan {plan.nombre}. Si algún indicador pasa a <strong style={{ color: COLOR.critico }}>rojo (80 %)</strong>, es momento
        de pasar al plan Pro o de liberar espacio.
      </p>

      <Medidor
        titulo="Tamaño de la base de datos"
        usado={mb(baseDatos.bytes)}
        limite={mb(baseDatos.limite)}
        porcentaje={baseDatos.porcentaje}
        nivel={baseDatos.nivel}
        detalle={
          baseDatos.crecimientoMensualBytes > 0
            ? `Crece unos ${mb(baseDatos.crecimientoMensualBytes)} por mes (según los últimos 30 días)${
                meses !== null ? `: al ritmo actual, el límite se alcanzaría en ${meses >= 24 ? "más de 2 años" : `unos ${meses} meses`}.` : "."
              } Al superar el límite, Supabase pone la base en solo lectura.`
            : "Sin crecimiento en los últimos 30 días."
        }
      />

      <Medidor
        titulo="Conexiones a la base"
        usado={conexiones.usadas}
        limite={conexiones.maximo}
        porcentaje={conexiones.porcentaje}
        nivel={conexiones.nivel}
        detalle={`La app usa como máximo ${conexiones.poolApp} conexiones a la vez; el resto son del propio Supabase (panel, API, mantenimiento).`}
      />

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Actividad</h2>
        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi-card"><div className="kpi-label">Encuestas (30 días)</div><div className="kpi-value">{actividad.ultimos30Dias.encuestas}</div></div>
          <div className="kpi-card"><div className="kpi-label">Clientes nuevos en la copia (30 días)</div><div className="kpi-value">{actividad.ultimos30Dias.clientesNuevos}</div></div>
          <div className="kpi-card"><div className="kpi-label">Correcciones en Twenty (30 días)</div><div className="kpi-value">{actividad.ultimos30Dias.correccionesTwenty}</div></div>
          <div className="kpi-card"><div className="kpi-label">Transacciones acumuladas</div><div className="kpi-value">{actividad.transacciones.toLocaleString("es-EC")}</div></div>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
          El plan {plan.nombre} no limita las transacciones; limita el tamaño de la base y el tráfico de salida.
          Pausa por inactividad ({plan.diasInactividadPausa} días):{" "}
          {actividad.ultimoKeepAlive ? (
            <strong style={{ color: COLOR.ok }}>
              protegida, último keep-alive {new Date(actividad.ultimoKeepAlive).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
            </strong>
          ) : (
            <strong style={{ color: COLOR.atencion }}>el keep-alive aún no corrió desde que arrancó el contenedor.</strong>
          )}
        </p>
      </div>

      <div className="card pad" style={{ marginBottom: 16 }}>
        <h2 className="section-title" style={{ marginTop: 0 }}>Qué ocupa espacio</h2>
        <table>
          <thead>
            <tr><th>Tabla</th><th>Contenido</th><th style={{ textAlign: "right" }}>Filas</th><th style={{ textAlign: "right" }}>Tamaño</th></tr>
          </thead>
          <tbody>
            {tablas.map((t) => (
              <tr key={t.tabla}>
                <td className="mono">{t.tabla}</td>
                <td style={{ fontSize: 13, color: "#4b5563" }}>{t.descripcion}</td>
                <td style={{ textAlign: "right" }}>{t.filas.toLocaleString("es-EC")}</td>
                <td style={{ textAlign: "right" }}>{mb(t.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card pad">
        <h2 className="section-title" style={{ marginTop: 0 }}>Lo que hay que mirar en Supabase</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
          El tráfico de salida (límite {mb(plan.egresoBytesMes)} al mes) no se puede medir desde la base: revísalo en Supabase →
          Organization → Usage. Para esta app suele ser bajo, porque solo se consultan listados y reportes.
        </p>
      </div>
    </div>
  );
}
