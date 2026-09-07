"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import ImportModal from "../../../components/ImportModal";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function haceUnMesISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

const PAGE_SIZE = 25;

export default function ReportesPage() {
  const [encuestadores, setEncuestadores] = useState([]);
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [pdvsDisponibles, setPdvsDisponibles] = useState([]);

  const [desde, setDesde] = useState(haceUnMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [encuestadorId, setEncuestadorId] = useState("");
  const [mesGestion, setMesGestion] = useState("");
  const [pdv, setPdv] = useState("");

  const [modalImportOpen, setModalImportOpen] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  // Filtro rápido en tabla y paginación
  const [filtroTexto, setFiltroTexto] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    fetch("/api/encuestadores")
      .then((r) => r.json())
      .then((d) => setEncuestadores((d.encuestadores || []).filter((e) => e.activo)));

    fetch("/api/clientes/meses")
      .then((r) => r.json())
      .then((d) => setMesesDisponibles(d.meses || []));

    fetch("/api/monitoreo")
      .then((r) => r.json())
      .then((d) => setPdvsDisponibles((d.pdvs || []).map((p) => p.pdv)));
  }, []);

  function construirQuery() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (encuestadorId) params.set("encuestador_id", encuestadorId);
    if (mesGestion) params.set("mes_gestion", mesGestion);
    if (pdv) params.set("pdv", pdv);
    return params.toString();
  }

  async function verResumen() {
    setCargando(true);
    setPagina(1);
    try {
      const res = await fetch(`/api/encuestas?${construirQuery()}`);
      const data = await res.json();
      setResumen(data);
    } finally {
      setCargando(false);
    }
  }

  async function descargarExcel() {
    setDescargando(true);
    try {
      window.location.href = `/api/encuestas/export?${construirQuery()}`;
    } finally {
      setTimeout(() => setDescargando(false), 2000);
    }
  }

  // Filtrado reactivo sobre las encuestas cargadas
  const encuestasFiltradas = useMemo(() => {
    if (!resumen?.encuestas) return [];
    if (!filtroTexto.trim()) return resumen.encuestas;
    const q = filtroTexto.toLowerCase().trim();
    return resumen.encuestas.filter((e) => {
      const nom = (e.cliente_nombre || "").toLowerCase();
      const cod = (e.codigo_cliente || "").toLowerCase();
      const enc = (e.encuestador_nombre || "").toLowerCase();
      const suc = (e.pdv || "").toLowerCase();
      return nom.includes(q) || cod.includes(q) || enc.includes(q) || suc.includes(q);
    });
  }, [resumen, filtroTexto]);

  // Paginación
  const totalPaginas = Math.max(1, Math.ceil(encuestasFiltradas.length / PAGE_SIZE));
  const encuestasPaginadas = useMemo(() => {
    const start = (pagina - 1) * PAGE_SIZE;
    return encuestasFiltradas.slice(start, start + PAGE_SIZE);
  }, [encuestasFiltradas, pagina]);

  // KPIs
  const kpis = useMemo(() => {
    if (!resumen?.encuestas?.length) return null;
    const total = resumen.encuestas.length;
    const completadas = resumen.encuestas.filter((e) => e.completada).length;
    const cortadas = total - completadas;
    const tasaEfectiva = Math.round((completadas / total) * 100);
    const encuestadoresUnicos = new Set(resumen.encuestas.map((e) => e.encuestador_nombre).filter(Boolean)).size;
    const sucursalesUnicas = new Set(resumen.encuestas.map((e) => e.pdv).filter(Boolean)).size;

    return { total, completadas, cortadas, tasaEfectiva, encuestadoresUnicos, sucursalesUnicas };
  }, [resumen]);

  return (
    <div className="container">
      <Link href="/admin/preguntas" className="back-link">← Panel admin</Link>
      <h1 className="page-title">Reportes de encuestas</h1>
      <p className="page-subtitle">
        Filtra por rango de fechas, encuestador, mes de gestión o PDV y descarga el reporte en Excel.
      </p>

      <div className="card pad">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="field-label">Desde</label>
            <input
              type="date"
              className="text-input"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Hasta</label>
            <input
              type="date"
              className="text-input"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>
          <div style={{ minWidth: 180 }}>
            <label className="field-label">Entrevistador</label>
            <select
              className="text-input"
              value={encuestadorId}
              onChange={(e) => setEncuestadorId(e.target.value)}
            >
              <option value="">Todos</option>
              {encuestadores.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 160 }}>
            <label className="field-label">Mes de gestión</label>
            <select
              className="text-input"
              value={mesGestion}
              onChange={(e) => setMesGestion(e.target.value)}
            >
              <option value="">Todos</option>
              {mesesDisponibles.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <label className="field-label">PDV / Sucursal</label>
            <select
              className="text-input"
              value={pdv}
              onChange={(e) => setPdv(e.target.value)}
            >
              <option value="">Todos los PDV</option>
              {pdvsDisponibles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={verResumen} disabled={cargando}>
              {cargando ? "Consultando…" : "Ver resumen"}
            </button>
            <button className="btn btn-primary" onClick={descargarExcel} disabled={descargando}>
              {descargando ? "Generando Excel…" : "Descargar Excel"}
            </button>
            <button
              className="btn"
              style={{ borderColor: "#818cf8", color: "#4f46e5", background: "#eef2ff", fontWeight: 600 }}
              onClick={() => setModalImportOpen(true)}
            >
              📥 Importar desde Excel
            </button>
          </div>
        </div>
      </div>

      <ImportModal
        isOpen={modalImportOpen}
        onClose={() => setModalImportOpen(false)}
        onSuccess={() => {
          verResumen();
        }}
      />

      {/* Tarjetas KPI de Resumen Ejecutivo */}
      {kpis && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginTop: 20 }}>
          <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #4f46e5" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>{kpis.total}</div>
            <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 4 }}>Total Encuestas</div>
          </div>
          <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #16a34a" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#16a34a" }}>{kpis.completadas}</div>
            <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 4 }}>Efectivas ({kpis.tasaEfectiva}%)</div>
          </div>
          <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #dc2626" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#dc2626" }}>{kpis.cortadas}</div>
            <div style={{ fontSize: 12.5, color: "#991b1b", marginTop: 4 }}>Cortadas / Filtro No</div>
          </div>
          <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #0891b2" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#0891b2" }}>{kpis.sucursalesUnicas}</div>
            <div style={{ fontSize: 12.5, color: "#0e7490", marginTop: 4 }}>Sucursales con Datos</div>
          </div>
          <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #7c3aed" }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#7c3aed" }}>{kpis.encuestadoresUnicos}</div>
            <div style={{ fontSize: 12.5, color: "#6d28d9", marginTop: 4 }}>Encuestadores Activos</div>
          </div>
        </div>
      )}

      {resumen && (
        <div className="card" style={{ marginTop: 20 }}>
          {resumen.encuestas?.length ? (
            <>
              {/* Barra de Filtro Rápido y Paginación */}
              <div className="pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, borderBottom: "1px solid #f0f1f3" }}>
                <div style={{ flex: "1 1 260px", maxWidth: 360 }}>
                  <input
                    type="text"
                    className="text-input"
                    placeholder="🔍 Filtrar en resultados (cliente, código, PDV)..."
                    value={filtroTexto}
                    onChange={(e) => {
                      setFiltroTexto(e.target.value);
                      setPagina(1);
                    }}
                    style={{ fontSize: 13 }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#4b5563" }}>
                  <span>
                    Mostrando {encuestasPaginadas.length} de {encuestasFiltradas.length} (Página {pagina} de {totalPaginas})
                  </span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      className="btn"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={pagina <= 1}
                      onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    >
                      ◀ Anterior
                    </button>
                    <button
                      className="btn"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={pagina >= totalPaginas}
                      onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    >
                      Siguiente ▶
                    </button>
                  </div>
                </div>
              </div>

              {resumen.preguntas?.length > 0 && (
                <div className="pad" style={{ paddingBottom: 0 }}>
                  <p className="section-subtitle" style={{ marginBottom: 14 }}>
                    Evaluación rápida por preguntas. Pasa el cursor sobre el número de reporte para ver el enunciado completo.
                  </p>
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Submission Id</th>
                      <th>Fecha</th>
                      <th>Encuestador</th>
                      <th>Cliente</th>
                      <th>Código</th>
                      <th>PDV</th>
                      <th>Estado</th>
                      {resumen.preguntas?.map((p) => (
                        <th key={p.id} title={p.texto} style={{ textAlign: "center", minWidth: 40 }}>
                          P{p.numero_reporte}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {encuestasPaginadas.map((e) => (
                      <tr key={e.id}>
                        <td className="mono" title={e.id}>{e.id.slice(0, 8)}…</td>
                        <td style={{ whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString("es-EC")}</td>
                        <td>{e.encuestador_nombre || "—"}</td>
                        <td style={{ fontWeight: 500 }}>{e.cliente_nombre || "—"}</td>
                        <td>{e.codigo_cliente || "—"}</td>
                        <td>{e.pdv || "—"}</td>
                        <td>
                          <span className={`badge ${e.completada ? "badge-completado" : "badge-fallido"}`} style={{ fontSize: 11 }}>
                            {e.completada ? "Efectiva" : "Cortada"}
                          </span>
                        </td>
                        {resumen.preguntas?.map((p) => (
                          <td key={p.id} style={{ textAlign: "center", fontWeight: 600 }}>
                            {e.respuestas?.[p.id]?.principal ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">No hay encuestas en los filtros seleccionados.</div>
          )}
        </div>
      )}
    </div>
  );
}
