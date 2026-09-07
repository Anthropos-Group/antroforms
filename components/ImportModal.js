"use client";

import { useState, useEffect } from "react";

function autoInferTarget(header = "", preguntas = []) {
  const h = header.toLowerCase().trim();

  // Submission Id real (UUID)
  if (h === "submission id" || h === "submissionid" || h.includes("submission id")) {
    return "submission_id";
  }

  // Omitir columnas técnicas de formularios para no colisionar con submission_id
  if (h.includes("formid") || h === "form id" || h.includes("form name") || h.includes("form version")) {
    return "ignore";
  }

  // Fecha / Submitted On
  if (h.includes("submitted on") || h.includes("fecha")) return "fecha";

  // Encuestador
  if (h.includes("encuestador") || h === "entrevistador") return "encuestador";
  if (h === "submitted by") return "ignore";

  // Código de Cliente
  if (h.includes("código") || h.includes("codigo")) {
    return "codigo_cliente";
  }

  // Nombre del Cliente
  if (
    h === "cliente" ||
    h === "nombre" ||
    h.includes("nombre cliente") ||
    h.includes("nombre_cliente") ||
    (h.includes("cliente") && !h.includes("código") && !h.includes("codigo"))
  ) {
    return "nombre_cliente";
  }

  // PDV / Sucursal
  if (h.includes("pdv") || h.includes("sucursal")) return "pdv";

  // Mes de Gestión
  if (h.includes("mes de gestión") || h.includes("mes_gestion") || h === "mes") return "mes_gestion";

  // Detección de justificativos (.1 o porqué)
  if (h.includes(".1") || h.includes("porqué") || h.includes("porque")) {
    if (h.includes("5.1") || h.includes("5.1.")) {
      const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 5);
      if (q) return `justificacion_${q.id}`;
    }
    if (h.includes("6.1") || h.includes("6.1.")) {
      const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 6);
      if (q) return `justificacion_${q.id}`;
    }
    if (h.includes("7.1") || h.includes("7.1.")) {
      const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 7);
      if (q) return `justificacion_${q.id}`;
    }
    if (h.includes("8.1") || h.includes("8.1.")) {
      const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 8);
      if (q) return `justificacion_${q.id}`;
    }
    if (h.includes("9.1") || h.includes("9.1.")) {
      const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 9);
      if (q) return `justificacion_${q.id}`;
    }
  }

  // Detección de preguntas principales
  if (h.startsWith("1.") || h.includes("acepta participar")) {
    const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 1);
    if (q) return `pregunta_${q.id}`;
  }
  if (h.startsWith("2.") || h.includes("persona que realizó")) {
    const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 2);
    if (q) return `pregunta_${q.id}`;
  }
  if (h.startsWith("5.") || h.includes("recomendaría")) {
    const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 5);
    if (q) return `pregunta_${q.id}`;
  }
  if (h.startsWith("6.") || h.includes("calidad de atención")) {
    const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 6);
    if (q) return `pregunta_${q.id}`;
  }
  if (h.startsWith("7.") || h.includes("calidad de las piezas")) {
    const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 7);
    if (q) return `pregunta_${q.id}`;
  }
  if (h.startsWith("8.") || h.includes("cumplimiento")) {
    const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 8);
    if (q) return `pregunta_${q.id}`;
  }
  if (h.startsWith("9.") || h.includes("experiencia de compra")) {
    const q = preguntas.find((p) => (p.numero_reporte ?? p.orden) === 9);
    if (q) return `pregunta_${q.id}`;
  }

  return "ignore";
}

async function safeFetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`El servidor devolvió una respuesta no válida (${res.status}): ${text.slice(0, 150)}`);
  }
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}: ${res.statusText}`);
  }
  return data;
}

export default function ImportModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [progresoVal, setProgresoVal] = useState(0);
  const [error, setError] = useState("");

  const [headers, setHeaders] = useState([]);
  const [samples, setSamples] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [parsedRows, setParsedRows] = useState([]);
  const [preguntas, setPreguntas] = useState([]);
  const [mapping, setMapping] = useState({});

  const [batchState, setBatchState] = useState({
    loteActual: 0,
    totalLotes: 0,
    procesadas: 0,
    total: 0,
    importadas: 0,
    duplicadas: 0,
  });

  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/encuestas")
        .then(async (r) => {
          if (!r.ok) return {};
          return r.json().catch(() => ({}));
        })
        .then((d) => setPreguntas(d.preguntas || []));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handlePrevisualizar() {
    if (!file) {
      setError("Por favor selecciona un archivo de Excel (.xlsx) o CSV.");
      return;
    }

    setError("");
    setCargando(true);
    setProgresoVal(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("preview", "true");

      const d = await safeFetchJson("/api/admin/import", {
        method: "POST",
        body: formData,
      });

      setHeaders(d.headers || []);
      setSamples(d.samples || []);
      setTotalRows(d.totalRows || 0);
      setParsedRows(d.rows || []);

      // Auto-mapeo inteligente
      const autoMap = {};
      (d.headers || []).forEach((h) => {
        autoMap[h] = autoInferTarget(h, preguntas);
      });
      setMapping(autoMap);
      setStep(2);
    } catch (err) {
      setError(`Error procesando archivo: ${err.message}`);
    } finally {
      setCargando(false);
    }
  }

  async function handleImportar() {
    if (parsedRows.length === 0) {
      setError("No hay registros en el archivo para procesar.");
      return;
    }

    setError("");
    setCargando(true);
    setProgresoVal(0);

    const BATCH_SIZE = 25;
    const total = parsedRows.length;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    let acumuladoImportadas = 0;
    let acumuladoDuplicados = 0;
    const acumuladoErrores = [];

    setBatchState({
      loteActual: 1,
      totalLotes: totalBatches,
      procesadas: 0,
      total,
      importadas: 0,
      duplicadas: 0,
    });

    try {
      for (let b = 0; b < totalBatches; b++) {
        const start = b * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, total);
        const batchRows = parsedRows.slice(start, end);

        setBatchState({
          loteActual: b + 1,
          totalLotes: totalBatches,
          procesadas: start,
          total,
          importadas: acumuladoImportadas,
          duplicadas: acumuladoDuplicados,
        });

        // Enviar el lote actual en JSON
        const resLote = await safeFetchJson("/api/admin/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rows: batchRows,
            mapping,
          }),
        });

        acumuladoImportadas += resLote.importadas || 0;
        acumuladoDuplicados += resLote.duplicados || 0;
        if (resLote.errores?.length) {
          acumuladoErrores.push(...resLote.errores);
        }

        const progresoReal = Math.min(100, Math.round((end / total) * 100));
        setProgresoVal(progresoReal);
        setBatchState((prev) => ({
          ...prev,
          procesadas: end,
          importadas: acumuladoImportadas,
          duplicadas: acumuladoDuplicados,
        }));
      }

      setProgresoVal(100);
      setResultado({
        importadas: acumuladoImportadas,
        duplicados: acumuladoDuplicados,
        errores: acumuladoErrores,
      });
      setStep(3);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(`Error ejecutando la importación: ${err.message}`);
    } finally {
      setCargando(false);
    }
  }

  function handleReset() {
    setFile(null);
    setStep(1);
    setError("");
    setHeaders([]);
    setSamples([]);
    setTotalRows(0);
    setParsedRows([]);
    setMapping({});
    setResultado(null);
    setProgresoVal(0);
    setBatchState({
      loteActual: 0,
      totalLotes: 0,
      procesadas: 0,
      total: 0,
      importadas: 0,
      duplicadas: 0,
    });
    onClose();
  }

  const targetOptions = [
    { key: "ignore", label: "-- Omitir / No importar --" },
    { key: "submission_id", label: "ID de Encuesta (Submission Id)" },
    { key: "fecha", label: "Fecha de Envío (Submitted On)" },
    { key: "encuestador", label: "Encuestador / Entrevistador" },
    { key: "nombre_cliente", label: "Nombre del Cliente" },
    { key: "codigo_cliente", label: "Código de Cliente" },
    { key: "pdv", label: "PDV / Sucursal" },
    { key: "mes_gestion", label: "Mes de Gestión" },
    ...preguntas.map((p) => ({
      key: `pregunta_${p.id}`,
      label: `Pregunta ${p.numero_reporte ?? p.orden}: ${p.texto.slice(0, 40)}...`,
    })),
    ...preguntas
      .filter((p) => p.requiere_justificacion)
      .map((p) => ({
        key: `justificacion_${p.id}`,
        label: `Justificativo P${p.numero_reporte ?? p.orden}.1 (¿Porqué?)`,
      })),
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: step === 2 ? 880 : 580 }}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: 18 }}>📥 Importar Encuestas desde Excel</h2>
          <button className="btn-close" onClick={handleReset}>✕</button>
        </div>

        {error && (
          <div className="validation-box" style={{ marginTop: 16, marginBottom: 0, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12 }}>
            <p style={{ margin: 0, color: "#991b1b", fontSize: 13.5, lineHeight: 1.4 }}>⚠️ {error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="pad" style={{ padding: "20px 0 0" }}>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 16px" }}>
              Selecciona el archivo Excel (.xlsx) o CSV exportado para subir las encuestas masivas.
            </p>

            <div className="file-drop-zone">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ fontSize: 14 }}
              />
              {file && (
                <div style={{ marginTop: 12, fontSize: 13, color: "#4f46e5", fontWeight: 600 }}>
                  📄 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            {cargando && (
              <div style={{ marginTop: 18, textAlign: "center" }}>
                <p style={{ fontSize: 13, color: "#4f46e5", fontWeight: 600, margin: "0 0 8px" }}>
                  ⏳ Leyendo y analizando archivo Excel...
                </p>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24 }}>
              <button className="btn" onClick={handleReset} disabled={cargando}>Cancelar</button>
              <button className="btn btn-primary" onClick={handlePrevisualizar} disabled={!file || cargando}>
                {cargando ? "Leyendo archivo…" : "Siguiente: Parametrizar Mapeo ▶"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="pad" style={{ padding: "16px 0 0" }}>
            {cargando ? (
              <div style={{ textAlign: "center", padding: "36px 20px" }}>
                <div className="result-icon-circle" style={{ background: "#4f46e5", margin: "0 auto 16px" }}>⚡</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>
                  Importando {totalRows} encuestas por lotes...
                </h3>
                <p style={{ color: "#6b7280", fontSize: 13.5, marginBottom: 20, maxWidth: 460, margin: "0 auto 20px" }}>
                  Lote {batchState.loteActual} de {batchState.totalLotes} ({batchState.procesadas} de {batchState.total} procesadas)
                </p>

                {/* Barra de progreso real */}
                <div style={{ maxWidth: 460, margin: "0 auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8, fontWeight: 600, color: "#4f46e5" }}>
                    <span>Progreso real</span>
                    <span>{progresoVal}%</span>
                  </div>
                  <div className="progress-track" style={{ height: 10, borderRadius: 5, overflow: "hidden", background: "#e5e7eb" }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${progresoVal}%`,
                        background: "#4f46e5",
                        height: "100%",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  {/* Estadísticas en vivo */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 14, fontSize: 13 }}>
                    <span style={{ color: "#16a34a", fontWeight: 600 }}>
                      ✓ {batchState.importadas} importadas
                    </span>
                    <span style={{ color: "#ca8a04", fontWeight: 600 }}>
                      ⚠️ {batchState.duplicadas} omitidas (duplicados)
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13.5, color: "#4b5563", margin: "0 0 14px" }}>
                  Se detectaron <strong>{headers.length} columnas</strong> y <strong>{totalRows} registros</strong> en el archivo. Verifica el mapeo a Supabase:
                </p>

                <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <table style={{ fontSize: 13, width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                        <th style={{ width: "35%", padding: "8px 12px", textAlign: "left" }}>Columna en Excel</th>
                        <th style={{ width: "30%", padding: "8px 12px", textAlign: "left" }}>Valor Muestra</th>
                        <th style={{ width: "35%", padding: "8px 12px", textAlign: "left" }}>Campo Destino en Supabase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headers.map((h, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ fontWeight: 600, fontSize: 12.5, padding: "8px 12px" }}>{h}</td>
                          <td style={{ fontSize: 12, color: "#6b7280", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "8px 12px" }}>
                            {samples[0]?.[h] || "—"}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <select
                              className="text-input"
                              style={{ padding: "4px 8px", fontSize: 12.5, width: "100%" }}
                              value={mapping[h] || "ignore"}
                              onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                            >
                              {targetOptions.map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
                  <button className="btn" onClick={() => setStep(1)} disabled={cargando}>◀ Cambiar archivo</button>
                  <button className="btn btn-primary" onClick={handleImportar} disabled={cargando}>
                    Procesar e Importar {totalRows} Encuestas (por lotes) ✓
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="pad" style={{ padding: "24px 0 0", textAlign: "center" }}>
            <div className="result-icon-circle success" style={{ width: 48, height: 48, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              ✓
            </div>
            <h3 style={{ margin: "0 0 16px" }}>Resumen del Proceso de Importación</h3>

            {/* Tarjetas de Resumen KPI */}
            <div className="import-kpi-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div className="import-kpi-card success" style={{ padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                <div className="import-kpi-value" style={{ fontSize: 24, fontWeight: 700, color: "#16a34a" }}>
                  {resultado?.importadas || 0}
                </div>
                <div className="import-kpi-label" style={{ fontSize: 12, color: "#15803d", marginTop: 4 }}>
                  Importadas con éxito
                </div>
              </div>
              <div className="import-kpi-card warning" style={{ padding: 16, background: "#fefce8", border: "1px solid #fef08a", borderRadius: 8 }}>
                <div className="import-kpi-value" style={{ fontSize: 24, fontWeight: 700, color: "#ca8a04" }}>
                  {resultado?.duplicados || 0}
                </div>
                <div className="import-kpi-label" style={{ fontSize: 12, color: "#a16207", marginTop: 4 }}>
                  Omitidas (Duplicadas)
                </div>
              </div>
              <div className="import-kpi-card danger" style={{ padding: 16, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8 }}>
                <div className="import-kpi-value" style={{ fontSize: 24, fontWeight: 700, color: "#dc2626" }}>
                  {resultado?.errores?.length || 0}
                </div>
                <div className="import-kpi-label" style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>
                  Errores / Fallidos
                </div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 20px" }}>
              Las encuestas existentes previamente (por Submission Id o combinación de cliente y fecha) fueron omitidas para prevenir duplicaciones.
            </p>

            <button className="btn btn-primary" onClick={handleReset}>Finalizar</button>
          </div>
        )}
      </div>
    </div>
  );
}
