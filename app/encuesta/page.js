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
  // Algunos registros de Twenty traen el string literal "NULL"/"N/A" en vez de
  // estar vacíos de verdad — el cron los limpia, pero esto cubre lo que aún no.
  const upper = texto.toUpperCase();
  return upper !== "NULL" && upper !== "N/A" && upper !== "NA";
}

// Avanza el cursor saltando automáticamente las preguntas cuya condición es un
// dato del cliente (ej. "TOTAL") que no está presente — esas quedan como N/A
// sin mostrarse. Si una condición depende de una respuesta previa y no se
// cumple, corta la encuesta ahí (comportamiento existente).
function siguienteIndice(preguntas, respuestas, desde, cliente) {
  let i = desde;
  const autoRespuestas = {};
  while (i < preguntas.length) {
    const p = preguntas[i];
    const cond = p.condicion;

    if (cond?.fuente === "cliente") {
      if (!tieneDatoCliente(cliente, cond.campo)) {
        autoRespuestas[p.id] = "N/A";
        i++;
        continue;
      }
      return { cortada: false, indice: i, autoRespuestas };
    }

    if (cond?.pregunta_id) {
      const previa = respuestas[cond.pregunta_id];
      if (previa !== cond.valor_esperado) {
        return { cortada: true, indice: i, autoRespuestas };
      }
    }

    return { cortada: false, indice: i, autoRespuestas };
  }
  return { cortada: false, indice: preguntas.length, autoRespuestas };
}

export default function EncuestaPage() {
  const [step, setStep] = useState("encuestador");

  const [encuestadores, setEncuestadores] = useState([]);
  const [encuestadorId, setEncuestadorId] = useState("");

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
  const [calTemp, setCalTemp] = useState(null);
  const [justTemp, setJustTemp] = useState("");

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

  const preguntaActual = cuestionario?.preguntas?.[indice];

  function elegirEncuestador(id) {
    setEncuestadorId(id);
    setStep("cliente");
  }

  function elegirCliente(c) {
    setCliente(c);
    const next = siguienteIndice(cuestionario.preguntas, {}, 0, c);
    setRespuestas(next.autoRespuestas);
    setIndice(next.indice);
    setStep("cuestionario");
  }

  function responder(pregunta, valor) {
    const conRespuesta = { ...respuestas, [pregunta.id]: valor };
    const preguntas = cuestionario.preguntas;
    const next = siguienteIndice(preguntas, conRespuesta, indice + 1, cliente);
    const nuevas = { ...conRespuesta, ...next.autoRespuestas };

    setRespuestas(nuevas);
    setCalTemp(null);
    setJustTemp("");

    if (next.indice >= preguntas.length && !next.cortada) {
      enviar(nuevas, true, preguntas.length);
    } else if (next.cortada) {
      enviar(nuevas, false, next.indice);
    } else {
      setIndice(next.indice);
    }
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
    return Math.round((indice / cuestionario.preguntas.length) * 100);
  }, [indice, cuestionario]);

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
        <div className="card pad">
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
      )}

      {step === "cuestionario" && cuestionario && cliente && (
        <div className="card">
          <div className="client-summary">
            <div><span>Cliente</span>{cliente.nombre}</div>
            <div><span>Código</span>{cliente.codigo_cliente}</div>
            <div><span>PDV</span>{cliente.pdv}</div>
            <div><span>Mes de gestión</span>{cliente.mes_gestion}</div>
          </div>

          <div className="pad">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progreso}%` }} />
            </div>

            {enviando && <div className="empty-state">Guardando…</div>}

            {!enviando && indice === 0 && guionApertura && (
              <div className="script-box">
                <span className="script-label">Guion (léelo al cliente)</span>
                {guionApertura}
              </div>
            )}

            {!enviando && preguntaActual && (
              <div>
                <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>
                  {preguntaActual.texto}
                </p>

                {preguntaActual.tipo === "aceptacion_si_no" && (
                  <div className="choice-row">
                    <button className="btn-choice btn-choice-yes" onClick={() => responder(preguntaActual, true)}>
                      Sí
                    </button>
                    <button className="btn-choice btn-choice-no" onClick={() => responder(preguntaActual, false)}>
                      No
                    </button>
                  </div>
                )}

                {preguntaActual.tipo === "escala_1_10" && (
                  <div>
                    <div className="scale-grid">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          className={`scale-btn${calTemp === n ? " selected" : ""}`}
                          onClick={() => setCalTemp(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>

                    {preguntaActual.requiere_justificacion && (
                      <div style={{ marginTop: 16 }}>
                        <label className="field-label">¿Por qué? (motivo de su calificación)</label>
                        <textarea
                          value={justTemp}
                          onChange={(e) => setJustTemp(e.target.value)}
                          placeholder="Escribe el motivo…"
                        />
                      </div>
                    )}

                    <div style={{ marginTop: 16 }}>
                      <button
                        className="btn btn-primary"
                        disabled={
                          calTemp === null ||
                          (preguntaActual.requiere_justificacion && justTemp.trim().length === 0)
                        }
                        onClick={() =>
                          responder(
                            preguntaActual,
                            preguntaActual.requiere_justificacion
                              ? { calificacion: calTemp, justificacion: justTemp.trim() }
                              : { calificacion: calTemp }
                          )
                        }
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                )}

                {preguntaActual.tipo === "texto_abierto" && (
                  <div>
                    <textarea value={justTemp} onChange={(e) => setJustTemp(e.target.value)} />
                    <div style={{ marginTop: 16 }}>
                      <button
                        className="btn btn-primary"
                        disabled={justTemp.trim().length === 0}
                        onClick={() => responder(preguntaActual, justTemp.trim())}
                      >
                        Continuar
                      </button>
                    </div>
                  </div>
                )}
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
