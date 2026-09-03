"use client";

import { useState, useEffect } from "react";

function autoInferTarget(header = "", preguntas = []) {
  const h = header.toLowerCase().trim();

  // Submission Id / FormId
  if (h.includes("submission id") || h === "submissionid" || h === "id" || h.includes("formid") || h === "form id") {
    return "submission_id";
  }

  // Fecha / Submitted On
  if (h.includes("submitted on") || h.includes("fecha")) return "fecha";

  // Encuestador
  if (h.includes("encuestador") || h === "submitted by" || h.startsWith("encuestador")) return "encuestador";

  // Código de Cliente (debe evaluarse antes de cliente)
  if (h.includes("código") || h.includes("codigo") || h === "código" || h === "codigo") {
    return "codigo_cliente";
  }

  // Nombre del Cliente: "Cliente", "3. Nombre Cliente:", "Nombre Cliente", etc.
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

export default function ImportModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(1);
  const [cargando, setCargando] = useState(false);
  const [progresoVal, setProgresoVal] = useState(0);
  const [error, setError] = useState("");

  const [headers, setHeaders] = useState([]);
  const [samples, setSamples] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [preguntas, setPreguntas] = useState([]);
  const [mapping, setMapping] = useState({});

  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetch("/api/encuestas")
        .then((r) => r.json())
        .then((d) => setPreguntas(d.preguntas || []));
    }
  }, [isOpen]);

  // Simulación de barra de progreso durante la carga o procesamiento
  useEffect(() => {
    let interval;
    if (cargando) {
      setProgresoVal(15);
      interval = setInterval(() => {
        setProgresoVal((prev) => {
          if (prev >= 92) return 92;
          return prev + 9;
        });
      }, 200);
    } else {
      setProgresoVal(100);
    }
    return () => clearInterval(interval);
  }, [cargando]);

  if (!isOpen) return null;

  async function handlePrevisualizar() {
    if (!file) {
      setError("Por favor selecciona un archivo de Excel (.xlsx) o CSV.");
      return;
    }

    setError("");
    setCargando(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("preview", "true");

      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });

      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "No se pudo leer el archivo");
        return;
      }

      setHeaders(d.headers || []);
      setSamples(d.samples || []);
      setTotalRows(d.totalRows || 0);

      // Auto-mapeo inteligente incluyendo 'Cliente' -> 'Nombre del Cliente'
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
    setError("");
    setCargando(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mapping", JSON.stringify(mapping));

      const res = await fetch("/api/admin/import", {
        method: "POST",
        body: formData,
      });

      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Error al importar los datos");
        return;
      }

      setResultado(d);
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
    setMapping({});
    setResultado(null);
    setProgresoVal(0);
    onClose();
  }

  const targetOptions = [
    { key: "ignore", label: "-- Omitir / No importar --" },
    { key: "submission_id", label: "ID de Encuesta (Submission Id / FormId)" },
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
          <div className="validation-box" style={{ marginTop: 16, marginBottom: 0 }}>
            <p style={{ margin: 0, color: "#991b1b", fontSize: 13.5 }}>⚠️ {error}</p>
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

            {/* Barra de progreso de lectura del archivo */}
            {cargando && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 6, fontWeight: 600, color: "#4f46e5" }}>
                  <span>Leyendo y analizando archivo Excel...</span>
                  <span>{progresoVal}%</span>
                </div>
                <div className="progress-track" style={{ height: 8 }}>
                  <div className="progress-fill" style={{ width: `${progresoVal}%`, background: "#4f46e5" }} />
                </div>
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
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div className="result-icon-circle" style={{ background: "#4f46e5", margin: "0 auto 16px" }}>⏳</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Importando {totalRows} encuestas a Supabase...</h3>
                <p style={{ color: "#6b7280", fontSize: 13.5, marginBottom: 24, maxWidth: 460, margin: "0 auto 24px" }}>
                  Validando duplicados por FormId / Submission Id, vinculando encuestadores y guardando respuestas...
                </p>
                <div style={{ maxWidth: 440, margin: "0 auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8, fontWeight: 600, color: "#4f46e5" }}>
                    <span>Progreso de importación</span>
                    <span>{progresoVal}%</span>
                  </div>
                  <div className="progress-track" style={{ height: 10 }}>
                    <div className="progress-fill" style={{ width: `${progresoVal}%`, background: "#4f46e5" }} />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13.5, color: "#4b5563", margin: "0 0 14px" }}>
                  Se detectaron <strong>{headers.length} columnas</strong> y <strong>{totalRows} registros</strong> en el archivo. Verifica el mapeo a Supabase:
                </p>

                <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <table style={{ fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ width: "35%" }}>Columna en Excel</th>
                        <th style={{ width: "30%" }}>Valor Muestra</th>
                        <th style={{ width: "35%" }}>Campo Destino en Supabase</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headers.map((h, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600, fontSize: 12.5 }}>{h}</td>
                          <td style={{ fontSize: 12, color: "#6b7280", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {samples[0]?.[h] || "—"}
                          </td>
                          <td>
                            <select
                              className="text-input"
                              style={{ padding: "4px 8px", fontSize: 12.5 }}
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
                    Procesar e Importar {totalRows} Encuestas ✓
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="pad" style={{ padding: "24px 0 0", textAlign: "center" }}>
            <div className="result-icon-circle success">✓</div>
            <h3 style={{ margin: "0 0 16px" }}>Resumen del Proceso de Importación</h3>

            {/* Tarjetas de Resumen KPI */}
            <div className="import-kpi-grid">
              <div className="import-kpi-card success">
                <div className="import-kpi-value">{resultado?.importadas || 0}</div>
                <div className="import-kpi-label">Importadas con éxito</div>
              </div>
              <div className="import-kpi-card warning">
                <div className="import-kpi-value">{resultado?.duplicados || 0}</div>
                <div className="import-kpi-label">Omitidas (Duplicadas)</div>
              </div>
              <div className="import-kpi-card danger">
                <div className="import-kpi-value">{resultado?.errores?.length || 0}</div>
                <div className="import-kpi-label">Errores / Fallidos</div>
              </div>
            </div>

            <p style={{ fontSize: 13, color: "#6b7280", margin: "18px 0 20px" }}>
              Las encuestas duplicadas (existentes previamente por FormId, Submission Id o cliente) fueron omitidas automáticamente para evitar duplicaciones.
            </p>

            <button className="btn btn-primary" onClick={handleReset}>Finalizar</button>
          </div>
        )}
      </div>
    </div>
  );
}
