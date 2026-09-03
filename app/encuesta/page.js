"use client";

import { useEffect, useMemo, useState } from "react";

function armarGuion(texto, valores) {
  if (!texto) return "";
  return texto
    .replaceAll("{{ENCUESTADOR}}", valores.encuestador || "—")
    .replaceAll("{{SUCURSAL}}", valores.sucursal || "—")
    .replaceAll("{{FECHA}}", valores.fecha || "—");
}

function formatFecha(valor) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function obtenerEtiquetasEscala(textoPregunta = "") {
  const lower = textoPregunta.toLowerCase();
  if (lower.includes("recomendaría") || lower.includes("recomendar")) {
    return { min: "1 - Menos recomendado", max: "10 - Más recomendado" };
  }
  if (lower.includes("satisfecho") || lower.includes("satisfacción")) {
    return { min: "1 - Nada satisfecho", max: "10 - Muy satisfecho" };
  }
  return { min: "1 - Mínimo (Menos recomendado)", max: "10 - Máximo (Más recomendado)" };
}

const DRAFTS_KEY = "antroforms_borradores";

function getBorradoresFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Error leyendo borradores de localStorage:", err);
    return [];
  }
}

function saveBorradorToStorage(borrador) {
  if (typeof window === "undefined" || !borrador || !borrador.id) return;
  try {
    const list = getBorradoresFromStorage();
    const existingIndex = list.findIndex((b) => b.id === borrador.id);
    const updatedBorrador = { ...borrador, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) {
      list[existingIndex] = updatedBorrador;
    } else {
      list.unshift(updatedBorrador);
    }
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Error guardando borrador en localStorage:", err);
  }
}

function deleteBorradorFromStorage(id) {
  if (typeof window === "undefined" || !id) return;
  try {
    const list = getBorradoresFromStorage();
    const filtered = list.filter((b) => b.id !== id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("Error eliminando borrador de localStorage:", err);
  }
}

const PASOS = [
  { key: "encuestador", label: "Encuestador" },
  { key: "cliente", label: "Cliente" },
  { key: "cuestionario", label: "Cuestionario" },
];

function Stepper({ paso }) {
  const indiceActual = PASOS.findIndex((p) => p.key === paso);
  return (
    <div className="stepper">
      {PASOS.map((p, i) => (
        <div key={p.key} style={{ display: "flex", alignItems: "center" }}>
          <div className={`stepper-item${i === indiceActual ? " active" : i < indiceActual ? " done" : ""}`}>
            <span className="stepper-dot">{i < indiceActual ? "✓" : i + 1}</span>
            {p.label}
          </div>
          {i < PASOS.length - 1 && <div className={`stepper-line${i < indiceActual ? " done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

function tieneDatoCliente(cliente, campo) {
  const valor = cliente?.[campo];
  if (valor === null || valor === undefined) return false;
  const texto = String(valor).trim();
  if (texto === "") return false;
  const upper = texto.toUpperCase();
  return upper !== "NULL" && upper !== "N/A" && upper !== "NA";
}

function evaluarAutoRespuestas(preguntas, cliente) {
  const auto = {};
  preguntas?.forEach((p) => {
    if (p.condicion?.fuente === "cliente" && !tieneDatoCliente(cliente, p.condicion.campo)) {
      auto[p.id] = "N/A";
    }
  });
  return auto;
}

function evaluarCortePrematuro(preguntas, respuestas) {
  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i];
    const cond = p.condicion;
    if (cond?.pregunta_id) {
      const previa = respuestas[cond.pregunta_id];
      if (previa !== undefined && previa !== null && previa !== "N/A" && previa !== cond.valor_esperado) {
        return { cortada: true, indiceCorte: i, preguntaCausaId: cond.pregunta_id };
      }
    }
  }
  return { cortada: false, indiceCorte: preguntas.length };
}

function validarCuestionarioCompleto(preguntas, respuestas, cliente) {
  const errores = [];
  const autoRespuestas = evaluarAutoRespuestas(preguntas, cliente);
  const corteInfo = evaluarCortePrematuro(preguntas, respuestas);

  const limite = corteInfo.cortada ? corteInfo.indiceCorte : preguntas.length;

  for (let i = 0; i < limite; i++) {
    const p = preguntas[i];
    if (autoRespuestas[p.id] === "N/A") continue;

    const val = respuestas[p.id];
    const numPregunta = i + 1;

    if (p.tipo === "aceptacion_si_no") {
      if (typeof val !== "boolean") {
        errores.push({
          preguntaId: p.id,
          indice: i,
          mensaje: `Pregunta ${numPregunta}: Debe seleccionar Sí o No.`,
        });
      }
    } else if (p.tipo === "escala_1_10") {
      const cal = typeof val === "object" ? val?.calificacion : val;
      const just = typeof val === "object" ? val?.justificacion : "";

      if (cal === undefined || cal === null || Number.isNaN(cal)) {
        errores.push({
          preguntaId: p.id,
          indice: i,
          mensaje: `Pregunta ${numPregunta}: Debe seleccionar una calificación del 1 al 10.`,
        });
      } else if (p.requiere_justificacion && (!just || String(just).trim().length === 0)) {
        errores.push({
          preguntaId: p.id,
          indice: i,
          mensaje: `Pregunta ${numPregunta}: Debe escribir el motivo / por qué de su calificación.`,
        });
      }
    } else if (p.tipo === "texto_abierto") {
      const texto = typeof val === "string" ? val.trim() : "";
      if (!texto) {
        errores.push({
          preguntaId: p.id,
          indice: i,
          mensaje: `Pregunta ${numPregunta}: Debe ingresar la respuesta.`,
        });
      }
    }
  }

  return { valido: errores.length === 0, errores, cortada: corteInfo.cortada, hasta: limite };
}

export default function EncuestaPage() {
  const [step, setStep] = useState("encuestador");

  const [encuestadores, setEncuestadores] = useState([]);
  const [encuestadorId, setEncuestadorId] = useState("");
  const [borradores, setBorradores] = useState([]);

  const [cuestionario, setCuestionario] = useState(null);
  const [cargandoCuestionario, setCargandoCuestionario] = useState(true);

  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [cliente, setCliente] = useState(null);
  const [mesesDisponibles, setMesesDisponibles] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState("");

  const [respuestas, setRespuestas] = useState({});
  const [indice, setIndice] = useState(0);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [erroresValidacion, setErroresValidacion] = useState([]);

  const [enviando, setEnviando] = useState(false);
  const [resultadoFinal, setResultadoFinal] = useState(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    fetch("/api/encuestadores")
      .then((r) => r.json())
      .then((d) => setEncuestadores((d.encuestadores || []).filter((e) => e.activo)));
    fetch("/api/cuestionarios/activo")
      .then((r) => r.json())
      .then((d) => setCuestionario(d.preguntas ? d : null))
      .finally(() => setCargandoCuestionario(false));
    fetch("/api/clientes/meses")
      .then((r) => r.json())
      .then((d) => {
        setMesesDisponibles(d.meses || []);
        setMesSeleccionado(d.mesActual || "TODOS");
      });
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim() });
      if (mesSeleccionado) params.set("mes_gestion", mesSeleccionado);
      fetch(`/api/clientes/search?${params.toString()}`)
        .then((r) => r.json())
        .then((d) => setResultados(d.results || []))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, mesSeleccionado]);

  // Cargar borradores cuando cambia el encuestador
  useEffect(() => {
    if (encuestadorId) {
      const list = getBorradoresFromStorage();
      setBorradores(list.filter((b) => b.encuestadorId === encuestadorId));
    } else {
      setBorradores([]);
    }
  }, [encuestadorId, step]);

  // Auto-guardar borrador al cambiar respuestas o índice
  useEffect(() => {
    if (step === "cuestionario" && activeDraftId && cliente && cuestionario) {
      saveBorradorToStorage({
        id: activeDraftId,
        encuestadorId,
        cuestionarioId: cuestionario.id,
        cliente,
        respuestas,
        indice,
      });
    }
  }, [respuestas, indice, step, activeDraftId, cliente, cuestionario, encuestadorId]);

  const preguntaActual = cuestionario?.preguntas?.[indice];

  function elegirEncuestador(id) {
    setEncuestadorId(id);
    const list = getBorradoresFromStorage();
    setBorradores(list.filter((b) => b.encuestadorId === id));
    setStep("cliente");
  }

  function elegirCliente(c) {
    setCliente(c);
    const auto = evaluarAutoRespuestas(cuestionario?.preguntas, c);
    const iniciales = { ...auto };
    setRespuestas(iniciales);
    setIndice(0);
    const newDraftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setActiveDraftId(newDraftId);
    setErroresValidacion([]);
    setStep("cuestionario");

    saveBorradorToStorage({
      id: newDraftId,
      encuestadorId,
      cuestionarioId: cuestionario?.id,
      cliente: c,
      respuestas: iniciales,
      indice: 0,
    });
  }

  function continuarBorrador(b) {
    setCliente(b.cliente);
    setRespuestas(b.respuestas || {});
    setIndice(b.indice || 0);
    setActiveDraftId(b.id);
    setErroresValidacion([]);
    setStep("cuestionario");
  }

  function eliminarBorradorHandler(e, bId) {
    e.stopPropagation();
    deleteBorradorFromStorage(bId);
    setBorradores((prev) => prev.filter((b) => b.id !== bId));
  }

  function actualizarRespuesta(preguntaId, nuevoValor) {
    setRespuestas((prev) => ({
      ...prev,
      [preguntaId]: nuevoValor,
    }));
    setErroresValidacion((prev) => prev.filter((e) => e.preguntaId !== preguntaId));
  }

  function manejarSubmit() {
    if (!cuestionario || !cliente) return;
    const resultadoVal = validarCuestionarioCompleto(cuestionario.preguntas, respuestas, cliente);

    if (!resultadoVal.valido) {
      setErroresValidacion(resultadoVal.errores);
      return;
    }

    setErroresValidacion([]);
    enviar(respuestas, !resultadoVal.cortada, resultadoVal.hasta);
  }

  async function enviar(respuestasFinales, completada, hasta) {
    setEnviando(true);
    const preguntasRespondidas = cuestionario.preguntas.slice(0, hasta);
    const payloadRespuestas = preguntasRespondidas.map((p) => ({
      pregunta_id: p.id,
      valor: respuestasFinales[p.id],
    }));

    try {
      const res = await fetch("/api/encuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuestionario_id: cuestionario.id,
          cliente_twenty_id: cliente.id_twenty,
          codigo_cliente: cliente.codigo_cliente,
          encuestador_id: encuestadorId,
          completada,
          respuestas: payloadRespuestas,
        }),
      });
      const data = await res.json();
      setResultadoFinal({ completada, id: data.id, twentyError: data.twentyError });

      // Al enviar con éxito, eliminar el borrador local
      if (activeDraftId) {
        deleteBorradorFromStorage(activeDraftId);
        setActiveDraftId(null);
      }
    } catch (err) {
      setResultadoFinal({ completada, error: err.message });
    } finally {
      setEnviando(false);
      setStep("fin");
    }
  }

  function nuevaEncuesta() {
    setStep("cliente");
    setCliente(null);
    setQuery("");
    setResultados([]);
    setRespuestas({});
    setIndice(0);
    setActiveDraftId(null);
    setErroresValidacion([]);
    setResultadoFinal(null);
    setCopiado(false);
  }

  async function copiarEtiqueta() {
    const texto = cliente?.etiqueta || "";
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const area = document.createElement("textarea");
      area.value = texto;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const progreso = useMemo(() => {
    if (!cuestionario) return 0;
    const auto = evaluarAutoRespuestas(cuestionario.preguntas, cliente);
    let respondidas = 0;
    cuestionario.preguntas.forEach((p) => {
      if (auto[p.id] === "N/A") return;
      const v = respuestas[p.id];
      if (p.tipo === "aceptacion_si_no" && typeof v === "boolean") respondidas++;
      else if (p.tipo === "escala_1_10") {
        const cal = typeof v === "object" ? v?.calificacion : v;
        if (cal !== undefined && cal !== null) respondidas++;
      } else if (p.tipo === "texto_abierto" && typeof v === "string" && v.trim()) respondidas++;
    });
    return Math.round((respondidas / cuestionario.preguntas.length) * 100);
  }, [respuestas, cuestionario, cliente]);

  const corteInfoActual = useMemo(() => {
    if (!cuestionario) return { cortada: false };
    return evaluarCortePrematuro(cuestionario.preguntas, respuestas);
  }, [cuestionario, respuestas]);

  const nombreEncuestador = encuestadores.find((e) => e.id === encuestadorId)?.nombre || "";
  const guionApertura = cuestionario
    ? armarGuion(cuestionario.guion_apertura, {
        encuestador: nombreEncuestador,
        sucursal: cliente?.pdv,
        fecha: formatFecha(cliente?.fecha_atencion),
      })
    : "";

  return (
    <div className="container">
      <h1 className="page-title">Encuesta de satisfacción</h1>
      <p className="page-subtitle">
        {cuestionario ? cuestionario.nombre : cargandoCuestionario ? "Cargando cuestionario…" : "No hay cuestionario activo"}
      </p>

      {step !== "fin" && <Stepper paso={step} />}

      {step === "encuestador" && (
        <div className="card pad">
          <label className="field-label">¿Quién está levantando esta encuesta?</label>
          <div className="option-list">
            {encuestadores.length === 0 && (
              <div className="empty-state">No hay encuestadores activos registrados.</div>
            )}
            {encuestadores.map((e) => (
              <div key={e.id} className="option-item" onClick={() => elegirEncuestador(e.id)}>
                <div className="nombre">{e.nombre}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "cliente" && (
        <div>
          {borradores.length > 0 && (
            <div className="card pad" style={{ marginBottom: 20, borderColor: "#c7d2fe", background: "#f5f7ff" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#3730a3" }}>
                📋 Borradores pendientes de {nombreEncuestador}
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#4f46e5" }}>
                Tienes encuestas iniciadas que no se han finalizado. Puedes reanudarlas o iniciar una nueva.
              </p>
              <div className="drafts-list">
                {borradores.map((b) => (
                  <div key={b.id} className="draft-item" onClick={() => continuarBorrador(b)}>
                    <div className="draft-info">
                      <div className="draft-title">{b.cliente?.nombre || "Cliente sin nombre"}</div>
                      <div className="draft-meta">
                        Código {b.cliente?.codigo_cliente || "—"} · {b.cliente?.pdv || "—"} ·{" "}
                        {b.updatedAt ? new Date(b.updatedAt).toLocaleString("es-EC") : "Reciente"}
                      </div>
                    </div>
                    <div className="draft-actions">
                      <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 13 }}>
                        Continuar
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "6px 10px", fontSize: 13, color: "#dc2626", borderColor: "#fca5a5" }}
                        onClick={(e) => eliminarBorradorHandler(e, b.id)}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card pad">
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Iniciar nueva encuesta</h3>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ minWidth: 200 }}>
                <label className="field-label">Mes de gestión</label>
                <select
                  className="text-input"
                  value={mesSeleccionado}
                  onChange={(e) => setMesSeleccionado(e.target.value)}
                >
                  <option value="TODOS">Todos los meses</option>
                  {mesesDisponibles.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="field-label">Buscar cliente por nombre</label>
            <input
              className="search-input"
              placeholder="Escribe al menos 3 letras del nombre…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {buscando && <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>Buscando…</div>}
            {resultados.length > 0 && (
              <div className="option-list" style={{ marginTop: 12 }}>
                {resultados.map((r) => (
                  <div key={r.id_twenty} className="option-item" onClick={() => elegirCliente(r)}>
                    <div className="nombre">{r.nombre}</div>
                    <div className="detalle">
                      Código {r.codigo_cliente} · {r.pdv} · {r.mes_gestion}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!buscando && query.trim().length >= 3 && resultados.length === 0 && (
              <div className="empty-state">
                Sin coincidencias {mesSeleccionado !== "TODOS" ? `en ${mesSeleccionado}` : ""} — prueba cambiando el mes de gestión arriba.
              </div>
            )}
          </div>
        </div>
      )}

      {step === "cuestionario" && cuestionario && cliente && (
        <div className="card">
          <div className="client-summary">
            <div><span>Cliente</span>{cliente.nombre}</div>
            <div><span>Código</span>{cliente.codigo_cliente}</div>
            <div><span>PDV</span>{cliente.pdv}</div>
            <div><span>Mes de gestión</span>{cliente.mes_gestion}</div>
            <div style={{ marginLeft: "auto" }}>
              <button
                className="btn"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => setStep("cliente")}
              >
                Cambiar cliente
              </button>
            </div>
          </div>

          <div className="pad">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progreso}%` }} />
            </div>

            {/* Selector directo de preguntas */}
            <div className="question-nav-bar">
              {cuestionario.preguntas.map((p, i) => {
                const val = respuestas[p.id];
                const auto = evaluarAutoRespuestas(cuestionario.preguntas, cliente)[p.id];
                const cal = typeof val === "object" ? val?.calificacion : val;
                const esCompleta =
                  auto === "N/A" ||
                  (p.tipo === "aceptacion_si_no" && typeof val === "boolean") ||
                  (p.tipo === "escala_1_10" &&
                    cal !== undefined &&
                    cal !== null &&
                    (!p.requiere_justificacion || (val?.justificacion && val.justificacion.trim().length > 0))) ||
                  (p.tipo === "texto_abierto" && typeof val === "string" && val.trim().length > 0);

                return (
                  <button
                    key={p.id}
                    className={`question-pill${i === indice ? " active" : ""}${esCompleta ? " done" : ""}`}
                    onClick={() => {
                      setIndice(i);
                      setErroresValidacion([]);
                    }}
                  >
                    P{i + 1}
                  </button>
                );
              })}
            </div>

            {enviando && <div className="empty-state">Guardando respuesta…</div>}

            {!enviando && indice === 0 && guionApertura && (
              <div className="script-box">
                <span className="script-label">Guion de apertura (léelo al cliente)</span>
                {guionApertura}
              </div>
            )}

            {/* Banner si la encuesta se cortó por respuesta Negativa en filtro inicial */}
            {corteInfoActual.cortada && (
              <div className="script-box" style={{ background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" }}>
                <span className="script-label" style={{ color: "#7f1d1d" }}>Aviso de finalización anticipada</span>
                El cliente respondió "No" en una de las preguntas de filtro. Al finalizar, la encuesta se guardará como <strong>CORTADA</strong>.
              </div>
            )}

            {/* Alerta de validación si al intentar finalizar faltan respuestas */}
            {erroresValidacion.length > 0 && (
              <div className="validation-box">
                <h4 style={{ margin: "0 0 6px", fontSize: 15, color: "#991b1b" }}>
                  ⚠️ No se puede finalizar la encuesta
                </h4>
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "#7f1d1d" }}>
                  Por favor completa las siguientes preguntas obligatorias antes de enviar:
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#991b1b" }}>
                  {erroresValidacion.map((err) => (
                    <li
                      key={err.preguntaId}
                      style={{ cursor: "pointer", textDecoration: "underline", marginBottom: 4 }}
                      onClick={() => {
                        setIndice(err.indice);
                        setErroresValidacion([]);
                      }}
                    >
                      {err.mensaje}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!enviando && preguntaActual && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", color: "#6b7280", fontWeight: 600, marginBottom: 4 }}>
                  Pregunta {indice + 1} de {cuestionario.preguntas.length}
                </div>
                <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 12 }}>
                  {preguntaActual.texto}
                </p>

                {preguntaActual.tipo === "aceptacion_si_no" && (
                  <div className="choice-row">
                    <button
                      className={`btn-choice btn-choice-yes${respuestas[preguntaActual.id] === true ? " selected" : ""}`}
                      onClick={() => actualizarRespuesta(preguntaActual.id, true)}
                    >
                      Sí
                    </button>
                    <button
                      className={`btn-choice btn-choice-no${respuestas[preguntaActual.id] === false ? " selected" : ""}`}
                      onClick={() => actualizarRespuesta(preguntaActual.id, false)}
                    >
                      No
                    </button>
                  </div>
                )}

                {preguntaActual.tipo === "escala_1_10" && (() => {
                  const valObj = respuestas[preguntaActual.id];
                  const cal = typeof valObj === "object" ? valObj?.calificacion : valObj;
                  const just = typeof valObj === "object" ? (valObj?.justificacion ?? "") : "";
                  const etiquetas = obtenerEtiquetasEscala(preguntaActual.texto);

                  return (
                    <div>
                      <div className="scale-grid">
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            className={`scale-btn${cal === n ? " selected" : ""}`}
                            onClick={() =>
                              actualizarRespuesta(
                                preguntaActual.id,
                                preguntaActual.requiere_justificacion
                                  ? { calificacion: n, justificacion: just }
                                  : { calificacion: n }
                              )
                            }
                          >
                            {n}
                          </button>
                        ))}
                      </div>

                      {/* Leyendas explicativas para 1 y 10 */}
                      <div className="scale-labels">
                        <span className="scale-label-min">{etiquetas.min}</span>
                        <span className="scale-label-max">{etiquetas.max}</span>
                      </div>

                      {preguntaActual.requiere_justificacion && (
                        <div style={{ marginTop: 16 }}>
                          <label className="field-label">¿Por qué? (motivo de su calificación)</label>
                          <textarea
                            value={just}
                            onChange={(e) =>
                              actualizarRespuesta(preguntaActual.id, {
                                calificacion: cal ?? null,
                                justificacion: e.target.value,
                              })
                            }
                            placeholder="Escribe el motivo de la calificación…"
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}

                {preguntaActual.tipo === "texto_abierto" && (
                  <div>
                    <textarea
                      value={typeof respuestas[preguntaActual.id] === "string" ? respuestas[preguntaActual.id] : ""}
                      onChange={(e) => actualizarRespuesta(preguntaActual.id, e.target.value)}
                      placeholder="Escribe la respuesta…"
                    />
                  </div>
                )}

                {/* Botones de Navegación Flexible */}
                <div className="nav-buttons-row">
                  <button
                    className="btn btn-secondary"
                    disabled={indice === 0}
                    onClick={() => {
                      setIndice((prev) => Math.max(0, prev - 1));
                      setErroresValidacion([]);
                    }}
                  >
                    ◀ Anterior
                  </button>

                  {indice < cuestionario.preguntas.length - 1 ? (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setIndice((prev) => Math.min(cuestionario.preguntas.length - 1, prev + 1));
                        setErroresValidacion([]);
                      }}
                    >
                      Siguiente ▶
                    </button>
                  ) : (
                    <div />
                  )}

                  <button
                    className="btn btn-primary"
                    style={{ marginLeft: "auto" }}
                    onClick={manejarSubmit}
                  >
                    Finalizar y Enviar Encuesta ✓
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {step === "fin" && resultadoFinal && (
        <div className="card pad" style={{ textAlign: "center" }}>
          <div className={`result-icon-circle ${resultadoFinal.completada ? "success" : "stopped"}`}>
            {resultadoFinal.completada ? "✓" : "✕"}
          </div>
          <h2 style={{ margin: "0 0 8px" }}>
            {resultadoFinal.completada ? "Encuesta completada" : "Encuesta cortada"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            {resultadoFinal.completada
              ? "Se guardó la respuesta y se actualizó el estado del cliente en Twenty a EFECTIVA."
              : "El cliente no continuó (no aceptó participar o no era quien compró). Se guardó lo respondido."}
          </p>
          {cuestionario?.guion_cierre && (
            <div className="script-box" style={{ textAlign: "left" }}>
              <span className="script-label">Guion de cierre (léelo al cliente)</span>
              {cuestionario.guion_cierre}
            </div>
          )}

          {cliente?.etiqueta && (
            <div className="copy-box">
              <span className="script-label" style={{ color: "#3730a3" }}>Etiqueta del cliente (para pegar donde corresponda)</span>
              <div className="copy-box-value">{cliente.etiqueta}</div>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={copiarEtiqueta}>
                {copiado ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          )}

          {resultadoFinal.twentyError && (
            <p style={{ color: "#991b1b", fontSize: 13 }}>
              Aviso: no se pudo actualizar el estado en Twenty ({resultadoFinal.twentyError}). La encuesta sí quedó guardada.
            </p>
          )}
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={nuevaEncuesta}>
            Levantar otra encuesta
          </button>
        </div>
      )}
    </div>
  );
}
