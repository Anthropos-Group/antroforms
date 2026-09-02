"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function haceUnMesISO() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function ReportesPage() {
  const [encuestadores, setEncuestadores] = useState([]);
  const [desde, setDesde] = useState(haceUnMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [encuestadorId, setEncuestadorId] = useState("");
  const [resumen, setResumen] = useState(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    fetch("/api/encuestadores")
      .then((r) => r.json())
      .then((d) => setEncuestadores(d.encuestadores || []));
  }, []);

  function construirQuery() {
    const params = new URLSearchParams();
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (encuestadorId) params.set("encuestador_id", encuestadorId);
    return params.toString();
  }

  async function verResumen() {
    setCargando(true);
    try {
      const res = await fetch(`/api/encuestas?${construirQuery()}`);
      const data = await res.json();
      setResumen(data);
    } finally {
      setCargando(false);
    }
  }

  function descargarExcel() {
    window.location.href = `/api/encuestas/export?${construirQuery()}`;
  }

  return (
    <div className="container">
      <Link href="/" className="back-link">← Inicio</Link>
      <h1 className="page-title">Reportes de encuestas</h1>
      <p className="page-subtitle">
        Filtra por rango de fechas (y opcionalmente por encuestador) y descarga el Excel.
      </p>

      <div className="card pad">
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
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
          <div style={{ minWidth: 220 }}>
            <label className="field-label">Encuestador (opcional)</label>
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
          <button className="btn" onClick={verResumen} disabled={cargando}>
            {cargando ? "Consultando…" : "Ver resumen"}
          </button>
          <button className="btn btn-primary" onClick={descargarExcel}>
            Descargar Excel
          </button>
        </div>
      </div>

      {resumen && (
        <div className="card" style={{ marginTop: 20 }}>
          {resumen.encuestas?.length ? (
            <>
              {resumen.preguntas?.length > 0 && (
                <div className="pad" style={{ paddingBottom: 0 }}>
                  <p className="section-subtitle" style={{ marginBottom: 14 }}>
                    Numeración igual a la del cuestionario original del cliente. Pasa el mouse sobre el número para ver el enunciado completo.
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
                      <th>Completada</th>
                      {resumen.preguntas?.map((p) => (
                        <>
                          <th key={p.id} title={p.texto}>{p.numero_reporte}</th>
                          {p.requiere_justificacion && (
                            <th key={`${p.id}_just`} title="¿Porqué? (Indíquenos el motivo de su calificación)">
                              {p.numero_reporte}.1
                            </th>
                          )}
                        </>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.encuestas.map((e) => (
                      <tr key={e.id}>
                        <td className="mono" title={e.id}>{e.id.slice(0, 8)}…</td>
                        <td style={{ whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString("es-EC")}</td>
                        <td>{e.encuestador_nombre}</td>
                        <td>{e.cliente_nombre}</td>
                        <td>{e.codigo_cliente}</td>
                        <td>{e.completada ? "Sí" : "No"}</td>
                        {resumen.preguntas?.map((p) => (
                          <>
                            <td key={p.id} style={{ textAlign: "center" }}>
                              {e.respuestas?.[p.id]?.principal ?? ""}
                            </td>
                            {p.requiere_justificacion && (
                              <td key={`${p.id}_just`}>{e.respuestas?.[p.id]?.justificacion ?? ""}</td>
                            )}
                          </>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state">No hay encuestas en ese rango de fechas.</div>
          )}
        </div>
      )}
    </div>
  );
}
