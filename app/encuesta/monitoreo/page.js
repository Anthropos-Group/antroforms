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

const PALETA_COLORES = [
  "#3b82f6", // azul
  "#22c55e", // verde
  "#ef4444", // rojo
  "#f59e0b", // amarillo / ambar
  "#8b5cf6", // morado
  "#ec4899", // rosa
  "#14b8a6", // turquesa
  "#6366f1", // indigo
  "#f97316", // naranja
  "#84cc16", // lima
];

function ReporteEntrevistadoresChart({ entrevistadores = [] }) {
  if (!entrevistadores || entrevistadores.length === 0) {
    return <div className="empty-state">No hay encuestas registradas en este mes.</div>;
  }

  const cx = 200;
  const cy = 130;
  const radius = 85;

  let currentAngle = 0;
  const slices = entrevistadores.map((item, index) => {
    const angle = (item.porcentaje / 100) * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + angle;
    const midAngle = startAngle + angle / 2;
    currentAngle = endAngle;

    const color = PALETA_COLORES[index % PALETA_COLORES.length];

    // Puntos de la rebanada
    const x1 = cx + radius * Math.cos(startAngle - Math.PI / 2);
    const y1 = cy + radius * Math.sin(startAngle - Math.PI / 2);
    const x2 = cx + radius * Math.cos(endAngle - Math.PI / 2);
    const y2 = cy + radius * Math.sin(endAngle - Math.PI / 2);
    const largeArcFlag = angle > Math.PI ? 1 : 0;

    const isFullCircle = angle >= 2 * Math.PI - 0.001;
    const pathD = isFullCircle
      ? ""
      : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

    // Pauta y etiqueta externa
    const lx1 = cx + (radius + 4) * Math.cos(midAngle - Math.PI / 2);
    const ly1 = cy + (radius + 4) * Math.sin(midAngle - Math.PI / 2);
    const lx2 = cx + (radius + 26) * Math.cos(midAngle - Math.PI / 2);
    const ly2 = cy + (radius + 26) * Math.sin(midAngle - Math.PI / 2);
    const alignRight = lx2 >= cx;

    return {
      ...item,
      color,
      isFullCircle,
      pathD,
      lx1,
      ly1,
      lx2,
      ly2,
      alignRight,
    };
  });

  return (
    <div>
      <div style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
        <svg viewBox="0 0 400 260" style={{ width: "100%", height: "auto", overflow: "visible" }}>
          {slices.map((slice) =>
            slice.isFullCircle ? (
              <circle key={slice.nombre} cx={cx} cy={cy} r={radius} fill={slice.color} />
            ) : (
              <path key={slice.nombre} d={slice.pathD} fill={slice.color} stroke="#ffffff" strokeWidth="2" />
            )
          )}

          {slices.map((slice) => (
            <g key={`label-${slice.nombre}`}>
              <line
                x1={slice.lx1}
                y1={slice.ly1}
                x2={slice.lx2}
                y2={slice.ly2}
                stroke="#94a3b8"
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />
              <text
                x={slice.alignRight ? slice.lx2 + 6 : slice.lx2 - 6}
                y={slice.ly2 + 4}
                textAnchor={slice.alignRight ? "start" : "end"}
                fontSize="11.5"
                fontWeight="600"
                fill="#1e293b"
              >
                {slice.nombre}: {slice.completadas} ({slice.porcentaje}%)
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Leyenda inferior */}
      <div className="pie-legend-grid">
        {slices.map((slice) => (
          <div key={`legend-${slice.nombre}`} className="pie-legend-item">
            <span className="pie-legend-dot" style={{ backgroundColor: slice.color }} />
            <span className="pie-legend-text">
              <strong>{slice.nombre}</strong>: {slice.completadas} ({slice.porcentaje}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
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

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const esAdmin = data?.rol === "admin";
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

      {/* KPI Cards solo visibles para Administrador */}
      {esAdmin && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Sucursales activas con datos</div>
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
      )}

      {/* Avance por Sucursal (Visible tanto para Encuestador como Administrador, filtrando las sucursales sin datos) */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="pad" style={{ paddingBottom: 0 }}>
          <h2 className="section-title">Avance por sucursal</h2>
          <p className="section-subtitle">Mostrando únicamente sucursales con registros en el mes.</p>
        </div>

        {pdvs.length === 0 ? (
          <div className="empty-state">No existen encuestas registradas para las sucursales en este mes.</div>
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

      {/* Secciones adicionales para Administrador: Reporte por Entrevistador e Histórico */}
      {esAdmin && (
        <>
          <div className="card pad" style={{ marginBottom: 20 }}>
            <h2 className="section-title">Reporte por entrevistador</h2>
            <p className="section-subtitle">Distribución del total de encuestas completadas por el equipo de encuestadores.</p>
            <ReporteEntrevistadoresChart entrevistadores={data?.entrevistadores || []} />
          </div>

          <div className="card pad">
            <h2 className="section-title">Histórico de encuestas completadas</h2>
            <p className="section-subtitle">Total por mes, todas las sucursales.</p>
            {!data || !data.historico || data.historico.length === 0 ? (
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
        </>
      )}
    </div>
  );
}
