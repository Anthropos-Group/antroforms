"use client";

import { useEffect, useState } from "react";
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
            <button className="btn btn-primary" onClick={descargarExcel}>
              Descargar Excel
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

      {resumen && (
        <div className="card" style={{ marginTop: 20 }}>
          {resumen.encuestas?.length ? (
            <>
              {resumen.preguntas?.length > 0 && (
                <div className="pad" style={{ paddingBottom: 0 }}>
                  <p className="section-subtitle" style={{ marginBottom: 14 }}>
                    Evaluación rápida por preguntas (números enteros). Pasa el mouse sobre el número para ver el enunciado completo.
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
                      <th>Completada</th>
                      {resumen.preguntas?.map((p) => (
                        <th key={p.id} title={p.texto} style={{ textAlign: "center" }}>
                          {p.numero_reporte}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.encuestas.map((e) => (
                      <tr key={e.id}>
                        <td className="mono" title={e.id}>{e.id.slice(0, 8)}…</td>
                        <td style={{ whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString("es-EC")}</td>
                        <td>{e.encuestador_nombre || "—"}</td>
                        <td>{e.cliente_nombre || "—"}</td>
                        <td>{e.codigo_cliente || "—"}</td>
                        <td>{e.pdv || "—"}</td>
                        <td>{e.completada ? "Sí" : "No"}</td>
                        {resumen.preguntas?.map((p) => (
                          <td key={p.id} style={{ textAlign: "center" }}>
                            {e.respuestas?.[p.id]?.principal ?? ""}
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
