"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import ImportModal from "../../../components/ImportModal";
import { hoyISOEcuador } from "../../../lib/fecha";

function haceUnMesISO() {
  const [anio, mes, dia] = hoyISOEcuador().split("-").map(Number);
  const d = new Date(Date.UTC(anio, mes - 2, dia));
  return d.toISOString().slice(0, 10);
}

const PAGE_SIZE = 25;

function colorPromedio(prom) {
  if (prom === null || prom === undefined) return "#6b7280";
  if (prom >= 9) return "#16a34a";
  if (prom >= 7) return "#d97706";
  return "#dc2626";
}

function DetalleEncuesta({ encuesta, preguntas, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontSize: 17 }}>{encuesta.cliente_nombre || "Cliente"}</h3>
          <button className="btn-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, fontSize: 13, margin: "14px 0" }}>
          <div><span style={{ color: "#6b7280" }}>Código</span><br /><strong>{encuesta.codigo_cliente || "—"}</strong></div>
          <div><span style={{ color: "#6b7280" }}>PDV</span><br /><strong>{encuesta.pdv || "—"}</strong></div>
          <div><span style={{ color: "#6b7280" }}>Teléfono</span><br /><strong>{encuesta.telefono1 || "—"}</strong></div>
          <div><span style={{ color: "#6b7280" }}>Encuestador</span><br /><strong>{encuesta.encuestador_nombre || "—"}</strong></div>
          <div><span style={{ color: "#6b7280" }}>Fecha</span><br /><strong>{new Date(encuesta.created_at).toLocaleString("es-EC")}</strong></div>
          <div>
            <span style={{ color: "#6b7280" }}>Estado</span><br />
            <span className={`badge ${encuesta.completada ? "badge-completado" : "badge-fallido"}`}>
              {encuesta.completada ? "Efectiva" : "Cortada"}
            </span>
          </div>
        </div>
        <div className="mono" style={{ fontSize: 11.5, color: "#9ca3af", marginBottom: 12 }}>Submission Id: {encuesta.id}</div>
        <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
          {preguntas.map((p) => {
            const r = encuesta.respuestas?.[p.id] || {};
            const sinRespuesta = r.principal === "" || r.principal === undefined;
            return (
              <div key={p.id} style={{ padding: "10px 0", borderTop: "1px solid #f0f1f3" }}>
                <div style={{ fontSize: 13, color: "#374151" }}>
                  <strong>P{p.numero_reporte}.</strong> {p.texto}
                </div>
                <div style={{ marginTop: 4, fontWeight: 600, color: sinRespuesta ? "#9ca3af" : "#111827" }}>
                  {sinRespuesta ? "Sin respuesta (encuesta cortada antes)" : String(r.principal)}
                </div>
                {p.requiere_justificacion && r.justificacion && r.justificacion !== "N/A" && (
                  <div style={{ marginTop: 4, fontSize: 13, color: "#4b5563", fontStyle: "italic" }}>
                    “{r.justificacion}”
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReportesPage() {
  const [encuestadores, setEncuestadores] = useState([]);
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [pdvsDisponibles, setPdvsDisponibles] = useState([]);

  const [desde, setDesde] = useState(haceUnMesISO());
  const [hasta, setHasta] = useState(hoyISOEcuador());
  const [encuestadorId, setEncuestadorId] = useState("");
  const [mesGestion, setMesGestion] = useState("");
  const [pdv, setPdv] = useState("");
  const [estado, setEstado] = useState("");

  const [modalImportOpen, setModalImportOpen] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [errorRango, setErrorRango] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [detalle, setDetalle] = useState(null);

  // Filtro rápido en tabla y paginación
  const [filtroTexto, setFiltroTexto] = useState("");
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    // Se incluyen los inactivos: los reportes históricos siguen necesitándolos.
    fetch("/api/encuestadores")
      .then((r) => r.json())
      .then((d) => setEncuestadores(d.encuestadores || []))
      .catch(() => {});

    fetch("/api/clientes/meses")
      .then((r) => r.json())
      .then((d) => setMesesDisponibles(d.meses || []))
      .catch(() => {});

    fetch("/api/monitoreo")
      .then((r) => r.json())
      .then((d) => setPdvsDisponibles((d.pdvs || []).map((p) => p.pdv).sort((a, b) => a.localeCompare(b))))
      .catch(() => {});
  }, []);

  function construirQuery() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (encuestadorId) params.set("encuestador_id", encuestadorId);
    if (mesGestion) params.set("mes_gestion", mesGestion);
    if (pdv) params.set("pdv", pdv);
    if (estado) params.set("estado", estado);
    return params.toString();
  }

  async function verResumen() {
    if (desde && hasta && desde > hasta) {
      setErrorRango("La fecha 'Desde' no puede ser posterior a 'Hasta'.");
      return;
    }
    setErrorRango("");
    setCargando(true);
    setPagina(1);
    try {
      const res = await fetch(`/api/encuestas?${construirQuery()}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorCarga(data.error || "No se pudo cargar el reporte");
        return;
      }
      setErrorCarga("");
      setResumen(data);
    } catch {
      setErrorCarga("Error de red al consultar el reporte.");
    } finally {
      setCargando(false);
    }
  }

  // Cargar resumen automáticamente en tiempo real al cambiar cualquier filtro
  useEffect(() => {
    if (desde && hasta && desde > hasta) {
      setErrorRango("La fecha 'Desde' no puede ser posterior a 'Hasta'.");
      return;
    }
    setErrorRango("");

    const timer = setTimeout(() => {
      verResumen();
    }, 350);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, encuestadorId, mesGestion, pdv, estado]);

  function descargarExcel() {
    setDescargando(true);
    window.location.href = `/api/encuestas/export?${construirQuery()}`;
    setTimeout(() => setDescargando(false), 2500);
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

  // KPIs calculados por el servidor sobre TODO el universo filtrado.
  const kpis = resumen?.resumen?.total ? resumen.resumen : null;
  const preguntasEscala = (resumen?.preguntas || []).filter((p) => p.tipo === "escala_1_10");

  return (
    <div className="container" style={{ maxWidth: 1180 }}>
      <Link href="/admin/preguntas" className="back-link">← Panel admin</Link>
      <h1 className="page-title">Reportes de encuestas</h1>
      <p className="page-subtitle">
        Filtra por rango de fechas, encuestador, mes de gestión, PDV o estado y descarga el reporte en Excel.
      </p>

      <div className="card pad">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label className="field-label">Desde</label>
            <input type="date" className="text-input" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Hasta</label>
            <input type="date" className="text-input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div style={{ minWidth: 180 }}>
            <label className="field-label">Entrevistador</label>
            <select className="text-input" value={encuestadorId} onChange={(e) => setEncuestadorId(e.target.value)}>
              <option value="">Todos</option>
              {encuestadores.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre}{e.activo ? "" : " (inactivo)"}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 160 }}>
            <label className="field-label">Mes de gestión</label>
            <select className="text-input" value={mesGestion} onChange={(e) => setMesGestion(e.target.value)}>
              <option value="">Todos</option>
              {mesesDisponibles.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 180 }}>
            <label className="field-label">PDV / Sucursal</label>
            <select className="text-input" value={pdv} onChange={(e) => setPdv(e.target.value)}>
              <option value="">Todos los PDV</option>
              {pdvsDisponibles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 140 }}>
            <label className="field-label">Estado</label>
            <select className="text-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="">Todas</option>
              <option value="efectiva">Efectivas</option>
              <option value="cortada">Cortadas</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" onClick={verResumen} disabled={cargando || !!errorRango}>
              {cargando ? "⏳ Actualizando…" : "Actualizar"}
            </button>
            <button className="btn btn-primary" onClick={descargarExcel} disabled={descargando || !!errorRango}>
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

        {errorRango && (
          <div style={{ marginTop: 12, padding: "8px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 6, fontSize: 13 }}>
            ⚠️ {errorRango}
          </div>
        )}
        {errorCarga && (
          <div style={{ marginTop: 12, padding: "8px 14px", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", borderRadius: 6, fontSize: 13 }}>
            ⚠️ {errorCarga}
          </div>
        )}
      </div>

      <ImportModal
        isOpen={modalImportOpen}
        onClose={() => setModalImportOpen(false)}
        onSuccess={() => {
          verResumen();
        }}
      />

      {detalle && (
        <DetalleEncuesta encuesta={detalle} preguntas={resumen?.preguntas || []} onClose={() => setDetalle(null)} />
      )}

      {/* Contenedor reactivo con feedback visual de carga */}
      <div style={{ opacity: cargando ? 0.6 : 1, transition: "opacity 0.2s" }}>
        {kpis && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginTop: 20 }}>
            <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #4f46e5" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#111827" }}>{kpis.total}</div>
              <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 4 }}>Total Encuestas</div>
            </div>
            <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #16a34a" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#16a34a" }}>{kpis.completadas}</div>
              <div style={{ fontSize: 12.5, color: "#15803d", marginTop: 4 }}>Efectivas ({kpis.tasa_efectiva}%)</div>
            </div>
            <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #dc2626" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#dc2626" }}>{kpis.cortadas}</div>
              <div style={{ fontSize: 12.5, color: "#991b1b", marginTop: 4 }}>Cortadas / Filtro No</div>
            </div>
            <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #0891b2" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#0891b2" }}>{kpis.pdvs}</div>
              <div style={{ fontSize: 12.5, color: "#0e7490", marginTop: 4 }}>Sucursales con Datos</div>
            </div>
            <div className="card pad" style={{ textAlign: "center", borderTop: "4px solid #7c3aed" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#7c3aed" }}>{kpis.encuestadores}</div>
              <div style={{ fontSize: 12.5, color: "#6d28d9", marginTop: 4 }}>Encuestadores</div>
            </div>
          </div>
        )}

        {kpis && preguntasEscala.length > 0 && (
          <div className="card pad" style={{ marginTop: 20 }}>
            <h2 className="section-title">Satisfacción por pregunta</h2>
            <p className="section-subtitle">
              Promedio de calificación (1-10) e índice neto: % promotores (9-10) menos % detractores (1-6).
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              {preguntasEscala.map((p) => {
                const st = kpis.preguntas?.[p.id];
                return (
                  <div key={p.id} className="kpi-card" title={p.texto}>
                    <div className="kpi-label" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      P{p.numero_reporte} · {p.texto}
                    </div>
                    <div className="kpi-value" style={{ color: colorPromedio(st?.promedio) }}>
                      {st?.n ? st.promedio.toFixed(1) : "—"}
                      <span className="kpi-sub"> / 10</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      {st?.n ? (
                        <>
                          Índice neto <strong style={{ color: st.nps >= 50 ? "#16a34a" : st.nps >= 0 ? "#d97706" : "#dc2626" }}>{st.nps > 0 ? "+" : ""}{st.nps}</strong>
                          {" · "}{st.n} resp.{st.na ? ` · ${st.na} N/A` : ""}
                        </>
                      ) : (
                        "Sin respuestas"
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {resumen && (
          <div className="card" style={{ marginTop: 20 }}>
            {resumen.truncado && (
              <div style={{ padding: "10px 16px", background: "#fffbeb", color: "#92400e", borderBottom: "1px solid #fde68a", fontSize: 13 }}>
                La tabla muestra las {resumen.limite} encuestas más recientes de {resumen.resumen?.total}. Los indicadores de arriba y el Excel sí incluyen todas.
              </div>
            )}
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

                  <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#4b5563", flexWrap: "wrap" }}>
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

                <div className="pad" style={{ paddingBottom: 0 }}>
                  <p className="section-subtitle" style={{ marginBottom: 14 }}>
                    Haz clic en una fila para ver todas las respuestas con sus justificaciones. Pasa el cursor sobre P# para ver el enunciado.
                  </p>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
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
                        <tr key={e.id} onClick={() => setDetalle(e)} style={{ cursor: "pointer" }} title="Ver detalle">
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
                          {resumen.preguntas?.map((p) => {
                            const v = e.respuestas?.[p.id]?.principal;
                            return (
                              <td key={p.id} style={{ textAlign: "center", fontWeight: 600 }}>
                                {v === "" || v === undefined || v === null ? "—" : String(v)}
                              </td>
                            );
                          })}
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
    </div>
  );
}
