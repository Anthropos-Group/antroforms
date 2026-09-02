"use client";

import { useEffect, useState } from "react";

function mesActualISO() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function nombreMesCorto(yyyyMm) {
  const [anio, mes] = yyyyMm.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, 1);
  return fecha.toLocaleDateString("es-EC", { month: "short", year: "2-digit" });
}

function nombreMesLargo(yyyyMm) {
  const [anio, mes] = yyyyMm.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, 1);
  const texto = fecha.toLocaleDateString("es-EC", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function estadoPdv(completadas, meta) {
  if (completadas >= meta) return { label: "Meta cumplida", clase: "badge-completado" };
  if (completadas > 0) return { label: "En progreso", clase: "badge-mode-incremental" };
  return { label: "Sin avance", clase: "badge-fallido" };
}

export default function MonitoreoPage() {
  const [mes, setMes] = useState(mesActualISO());
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch(`/api/monitoreo?mes=${mes}`);
      const d = await res.json();
      setData(d);
      setUltimaActualizacion(new Date());
    } finally {
      setCargando(false);
    }
  }

  // Una sola carga automática al entrar a la pestaña — el resto es manual con
  // el botón "Actualizar", para no pegarle a Supabase todo el tiempo.
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pdvs = data?.pdvs || [];
  const meta = data?.meta_por_pdv || 25;
  const totalSucursales = pdvs.length;
  const totalCompletadas = pdvs.reduce((acc, p) => acc + p.completadas, 0);
  const totalMeta = totalSucursales * meta;
  const avancePct = totalMeta > 0 ? Math.round((totalCompletadas / totalMeta) * 100) : 0;
  const sucursalesCumplidas = pdvs.filter((p) => p.completadas >= meta).length;
  const maxHistorico = Math.max(1, ...(data?.historico?.map((h) => h.completadas) || [1]));

  return (
    <div className="container">
      <h1 className="page-title">Monitoreo por PDV</h1>
      <p className="page-subtitle">
        {data ? nombreMesLargo(mes) : "Cargando…"} · meta de {meta} encuestas completadas por sucursal.
      </p>

      <div className="card pad" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <label className="field-label">Mes</label>
          <input type="month" className="text-input" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={cargar} disabled={cargando}>
          {cargando ? "Actualizando…" : "Actualizar"}
        </button>
        {ultimaActualizacion && (
          <span style={{ fontSize: 12.5, color: "#9ca3af" }}>
            Última actualización: {ultimaActualizacion.toLocaleTimeString("es-EC")} — no se refresca solo, usa el botón cuando quieras ver el estado actual.
          </span>
        )}
      </div>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Sucursales monitoreadas</div>
          <div className="kpi-value">{totalSucursales}</div>
        </div>
        <div className="kpi-card accent">
          <div className="kpi-label">Completadas este mes</div>
          <div className="kpi-value kpi-accent">
            {totalCompletadas} <span className="kpi-sub">/ {totalMeta} meta</span>
          </div>
        </div>
        <div className={`kpi-card ${avancePct >= 100 ? "good" : "accent"}`}>
          <div className="kpi-label">Avance del mes</div>
          <div className={`kpi-value ${avancePct >= 100 ? "kpi-good" : "kpi-accent"}`}>{avancePct}%</div>
        </div>
        <div className="kpi-card good">
          <div className="kpi-label">Sucursales con meta cumplida</div>
          <div className="kpi-value kpi-good">
            {sucursalesCumplidas} <span className="kpi-sub">/ {totalSucursales}</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="pad" style={{ paddingBottom: 0 }}>
          <h2 className="section-title">Avance por sucursal</h2>
          <p className="section-subtitle">Ordenadas de mayor a menor avance.</p>
        </div>

        {pdvs.length === 0 ? (
          <div className="empty-state">Sin datos todavía.</div>
        ) : (
          <>
            <div className="pdv-table-head">
              <div>Sucursal</div>
              <div>Progreso</div>
              <div>Completadas</div>
              <div>Estado</div>
            </div>
            {pdvs.map((p) => {
              const pct = Math.min(100, Math.round((p.completadas / meta) * 100));
              const completo = p.completadas >= meta;
              const estado = estadoPdv(p.completadas, meta);
              return (
                <div key={p.pdv} className="pdv-row">
                  <div className="pdv-name">{p.pdv}</div>
                  <div className="pdv-bar-track">
                    <div className={`pdv-bar-fill${completo ? " completo" : ""}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="pdv-count">{p.completadas} / {meta}</div>
                  <div><span className={`badge ${estado.clase}`}>{estado.label}</span></div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="card pad">
        <h2 className="section-title">Histórico de encuestas completadas</h2>
        <p className="section-subtitle">Total por mes, todas las sucursales.</p>
        {!data || data.historico.length === 0 ? (
          <div className="empty-state">Sin histórico todavía.</div>
        ) : (
          <div className="chart-bars">
            {data.historico.map((h) => (
              <div key={h.mes} className="chart-bar-col">
                <div className="chart-bar-value">{h.completadas}</div>
                <div className="chart-bar" style={{ height: `${Math.max(4, (h.completadas / maxHistorico) * 100)}%` }} />
                <div className="chart-bar-label">{nombreMesCorto(h.mes)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
