"use client";

import { useEffect, useState, useMemo } from "react";
import { mesISOEcuador } from "../../../lib/fecha";

// Mes en curso según la hora de Ecuador (no la del navegador ni UTC).
const mesActualISO = () => mesISOEcuador();

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
  "#3b82f6", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#6366f1", "#f97316", "#84cc16",
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

    const x1 = cx + radius * Math.cos(startAngle - Math.PI / 2);
    const y1 = cy + radius * Math.sin(startAngle - Math.PI / 2);
    const x2 = cx + radius * Math.cos(endAngle - Math.PI / 2);
    const y2 = cy + radius * Math.sin(endAngle - Math.PI / 2);
    const largeArcFlag = angle > Math.PI ? 1 : 0;

    const isFullCircle = angle >= 2 * Math.PI - 0.001;
    const pathD = isFullCircle
      ? ""
      : `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;

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
              <polyline
                points={`${slice.lx1.toFixed(2)},${slice.ly1.toFixed(2)} ${slice.lx2.toFixed(2)},${slice.ly2.toFixed(2)}`}
                fill="none"
                stroke="#cbd5e1"
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

export default function AdminMonitoreoPage() {
  const [mes, setMes] = useState(mesActualISO());
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  // Opciones de orden y filtro de sucursales
  const [criterioOrden, setCriterioOrden] = useState("mayor_avance");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  const [error, setError] = useState("");

  async function cargar({ silencioso = false } = {}) {
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    if (!silencioso) setCargando(true);
    try {
      const res = await fetch(`/api/monitoreo?mes=${mes}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Error al cargar");
      setData(d);
      setError("");
      setUltimaActualizacion(new Date());
    } catch (err) {
      setError(`No se pudo actualizar el monitoreo: ${err.message}`);
    } finally {
      setCargando(false);
    }
  }

  // Recarga al cambiar de mes y refresca sola cada minuto (tablero en vivo).
  useEffect(() => {
    cargar();
    const intervalo = setInterval(() => cargar({ silencioso: true }), 60_000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes]);

  const pdvs = data?.pdvs || [];
  const meta = data?.meta_por_pdv || 25;
  const totalSucursales = pdvs.length;
  const totalCompletadas = pdvs.reduce((acc, p) => acc + p.completadas, 0);
  const totalMeta = totalSucursales * meta;
  const avancePct = totalMeta > 0 ? Math.round((totalCompletadas / totalMeta) * 100) : 0;
  const sucursalesCumplidas = pdvs.filter((p) => p.completadas >= meta).length;
  const sucursalesSinAvance = pdvs.filter((p) => p.completadas === 0).length;
  const maxHistorico = Math.max(1, ...(data?.historico?.map((h) => h.completadas) || [1]));

  // Filtrado y ordenamiento de sucursales
  const pdvsProcesados = useMemo(() => {
    let list = [...pdvs];

    // Filtro por estado
    if (filtroEstado === "sin_avance") {
      list = list.filter((p) => p.completadas === 0);
    } else if (filtroEstado === "en_progreso") {
      list = list.filter((p) => p.completadas > 0 && p.completadas < meta);
    } else if (filtroEstado === "cumplidas") {
      list = list.filter((p) => p.completadas >= meta);
    }

    // Orden
    if (criterioOrden === "mayor_avance") {
      list.sort((a, b) => b.completadas - a.completadas || a.pdv.localeCompare(b.pdv));
    } else if (criterioOrden === "menor_avance") {
      list.sort((a, b) => a.completadas - b.completadas || a.pdv.localeCompare(b.pdv));
    } else if (criterioOrden === "alfabetico") {
      list.sort((a, b) => a.pdv.localeCompare(b.pdv));
    }

    return list;
  }, [pdvs, meta, filtroEstado, criterioOrden]);

  return (
    <div className="container">
      <h1 className="page-title">Monitoreo por PDV (Administrador)</h1>
      <p className="page-subtitle">
        {data ? nombreMesLargo(mes) : "Cargando…"} · meta de {meta} encuestas completadas por sucursal.
      </p>

      <div className="card pad" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <label className="field-label">Mes a consultar</label>
          <input type="month" className="text-input" value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => cargar()} disabled={cargando}>
          {cargando ? "Actualizando…" : "Consultar"}
        </button>
        {ultimaActualizacion && (
          <span style={{ fontSize: 12.5, color: "#9ca3af" }}>
            Última actualización: {ultimaActualizacion.toLocaleTimeString("es-EC")} · se actualiza cada minuto
          </span>
        )}
      </div>

      {error && (
        <div className="validation-box" style={{ marginBottom: 20 }}>⚠️ {error}</div>
      )}

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total Sucursales (PDVs)</div>
          <div className="kpi-value">{totalSucursales}</div>
        </div>
        <div className="kpi-card accent">
          <div className="kpi-label">Completadas este mes</div>
          <div className="kpi-value kpi-accent">
            {totalCompletadas} <span className="kpi-sub">/ {totalMeta} meta</span>
          </div>
        </div>
        <div className={`kpi-card ${avancePct >= 100 ? "good" : "accent"}`}>
          <div className="kpi-label">Avance global del mes</div>
          <div className={`kpi-value ${avancePct >= 100 ? "kpi-good" : "kpi-accent"}`}>{avancePct}%</div>
        </div>
        <div className="kpi-card good">
          <div className="kpi-label">Metas cumplidas</div>
          <div className="kpi-value kpi-good">
            {sucursalesCumplidas} <span className="kpi-sub">/ {totalSucursales}</span>
          </div>
        </div>
        {sucursalesSinAvance > 0 && (
          <div className="kpi-card" style={{ borderLeft: "4px solid #dc2626" }}>
            <div className="kpi-label" style={{ color: "#991b1b" }}>Sucursales sin avance (0)</div>
            <div className="kpi-value" style={{ color: "#dc2626" }}>{sucursalesSinAvance}</div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, borderBottom: "1px solid #f0f1f3" }}>
          <div>
            <h2 className="section-title" style={{ margin: 0 }}>Avance por sucursal</h2>
            <p className="section-subtitle" style={{ margin: "4px 0 0" }}>
              Mostrando {pdvsProcesados.length} de {totalSucursales} sucursales.
            </p>
          </div>

          {/* Filtros y ordenamiento */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select
              className="text-input"
              value={criterioOrden}
              onChange={(e) => setCriterioOrden(e.target.value)}
              style={{ fontSize: 13, padding: "4px 10px" }}
            >
              <option value="mayor_avance">Ordenar: Mayor avance</option>
              <option value="menor_avance">Ordenar: Menor avance (Atención)</option>
              <option value="alfabetico">Ordenar: Alfabético</option>
            </select>

            <select
              className="text-input"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              style={{ fontSize: 13, padding: "4px 10px" }}
            >
              <option value="todos">Ver: Todas las sucursales</option>
              <option value="sin_avance">Solo: Sin avance (0)</option>
              <option value="en_progreso">Solo: En progreso</option>
              <option value="cumplidas">Solo: Meta cumplida</option>
            </select>
          </div>
        </div>

        {pdvsProcesados.length === 0 ? (
          <div className="empty-state">No existen sucursales con el filtro seleccionado.</div>
        ) : (
          <>
            <div className="pdv-table-head">
              <div>Sucursal</div>
              <div>Progreso</div>
              <div>Completadas</div>
              <div>Estado</div>
            </div>
            {pdvsProcesados.map((p) => {
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

      <div className="card pad" style={{ marginBottom: 20 }}>
        <h2 className="section-title">Reporte por entrevistador</h2>
        <p className="section-subtitle">Distribución del total de encuestas completadas por el equipo de encuestadores en {nombreMesLargo(mes)}.</p>
        <ReporteEntrevistadoresChart entrevistadores={data?.entrevistadores || []} />
      </div>

      <div className="card pad">
        <h2 className="section-title">Histórico de encuestas completadas</h2>
        <p className="section-subtitle">Total mensual acumulado de encuestas efectivas.</p>
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
    </div>
  );
}
