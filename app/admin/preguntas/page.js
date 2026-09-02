"use client";

import { useEffect, useState } from "react";

const TIPOS = [
  { value: "aceptacion_si_no", label: "Sí / No" },
  { value: "escala_1_10", label: "Escala 1-10" },
  { value: "texto_abierto", label: "Texto abierto" },
];

const CLIENTE_TOTAL = "__cliente_total__";

function condicionVacia() {
  return { pregunta_id: "", valor_esperado: "true" };
}

// Convierte el objeto `condicion` guardado en la API al estado del <select> del formulario.
function condicionAEstado(condicion) {
  if (!condicion) return condicionVacia();
  if (condicion.fuente === "cliente") return { pregunta_id: CLIENTE_TOTAL, valor_esperado: "true" };
  return { pregunta_id: condicion.pregunta_id, valor_esperado: condicion.valor_esperado ? "true" : "false" };
}

// Convierte el estado del formulario de vuelta al objeto `condicion` que espera la API.
function estadoACondicion(estado) {
  if (estado.pregunta_id === "") return null;
  if (estado.pregunta_id === CLIENTE_TOTAL) return { fuente: "cliente", campo: "total" };
  return { pregunta_id: estado.pregunta_id, valor_esperado: estado.valor_esperado === "true" };
}

function describirCondicion(condicion, nombrePregunta) {
  if (!condicion) return "—";
  if (condicion.fuente === "cliente") {
    return `Dato del cliente: ${condicion.campo.toUpperCase()} (si vacío, N/A)`;
  }
  return `${nombrePregunta(condicion.pregunta_id)} = ${condicion.valor_esperado ? "Sí" : "No"}`;
}

export default function PreguntasPage() {
  const [preguntas, setPreguntas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState(null);
  const [edit, setEdit] = useState(null);

  const [nuevo, setNuevo] = useState({
    texto: "",
    tipo: "escala_1_10",
    numero_reporte: "",
    requiere_justificacion: true,
    condicion: condicionVacia(),
  });
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);
  const [error, setError] = useState("");

  function cargar() {
    setCargando(true);
    fetch("/api/preguntas")
      .then((r) => r.json())
      .then((d) => setPreguntas(d.preguntas || []))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  function empezarEdicion(p) {
    setEditandoId(p.id);
    setEdit({
      texto: p.texto,
      tipo: p.tipo,
      numero_reporte: p.numero_reporte ?? p.orden,
      requiere_justificacion: p.requiere_justificacion,
      condicion: condicionAEstado(p.condicion),
    });
  }

  async function guardarEdicion(id) {
    const condicion = estadoACondicion(edit.condicion);

    const res = await fetch(`/api/preguntas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: edit.texto,
        tipo: edit.tipo,
        numero_reporte: Number(edit.numero_reporte),
        requiere_justificacion: edit.requiere_justificacion,
        condicion,
      }),
    });
    if (res.ok) {
      setEditandoId(null);
      cargar();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "No se pudo guardar");
    }
  }

  async function toggleActiva(p) {
    await fetch(`/api/preguntas/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activa: !p.activa }),
    });
    cargar();
  }

  async function crear() {
    setError("");
    if (!nuevo.texto.trim()) {
      setError("Escribe el texto de la pregunta");
      return;
    }
    setGuardandoNuevo(true);
    const condicion = estadoACondicion(nuevo.condicion);

    const res = await fetch("/api/preguntas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: nuevo.texto.trim(),
        tipo: nuevo.tipo,
        numero_reporte: nuevo.numero_reporte === "" ? undefined : Number(nuevo.numero_reporte),
        requiere_justificacion: nuevo.requiere_justificacion,
        condicion,
      }),
    });
    setGuardandoNuevo(false);
    if (res.ok) {
      setNuevo({ texto: "", tipo: "escala_1_10", numero_reporte: "", requiere_justificacion: true, condicion: condicionVacia() });
      cargar();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo crear la pregunta");
    }
  }

  function nombrePregunta(id) {
    const p = preguntas.find((x) => x.id === id);
    return p ? `#${p.orden} — ${p.texto.slice(0, 40)}${p.texto.length > 40 ? "…" : ""}` : id;
  }

  return (
    <div className="container">
      <h1 className="page-title">Preguntas del cuestionario</h1>
      <p className="page-subtitle">
        Edita el texto, tipo o la lógica condicional. Desactivar una pregunta no borra el histórico de respuestas ya guardadas.
      </p>

      <div className="card">
        {cargando ? (
          <div className="empty-state">Cargando…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Orden</th>
                <th>N° reporte</th>
                <th>Texto</th>
                <th>Tipo</th>
                <th>¿Por qué?</th>
                <th>Condición</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {preguntas.map((p) => (
                <tr key={p.id}>
                  {editandoId === p.id ? (
                    <>
                      <td>{p.orden}</td>
                      <td>
                        <input
                          type="number"
                          className="text-input"
                          style={{ width: 64 }}
                          value={edit.numero_reporte}
                          onChange={(e) => setEdit({ ...edit, numero_reporte: e.target.value })}
                        />
                      </td>
                      <td>
                        <textarea
                          className="text-input"
                          value={edit.texto}
                          onChange={(e) => setEdit({ ...edit, texto: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="text-input"
                          value={edit.tipo}
                          onChange={(e) => setEdit({ ...edit, tipo: e.target.value })}
                        >
                          {TIPOS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={edit.requiere_justificacion}
                          onChange={(e) => setEdit({ ...edit, requiere_justificacion: e.target.checked })}
                        />
                      </td>
                      <td>
                        <select
                          className="text-input"
                          value={edit.condicion.pregunta_id}
                          onChange={(e) =>
                            setEdit({ ...edit, condicion: { ...edit.condicion, pregunta_id: e.target.value } })
                          }
                        >
                          <option value="">Sin condición</option>
                          <option value={CLIENTE_TOTAL}>Dato del cliente: Total (si vacío, N/A)</option>
                          {preguntas.filter((x) => x.id !== p.id).map((x) => (
                            <option key={x.id} value={x.id}>{nombrePregunta(x.id)}</option>
                          ))}
                        </select>
                        {edit.condicion.pregunta_id && edit.condicion.pregunta_id !== CLIENTE_TOTAL && (
                          <select
                            className="text-input"
                            style={{ marginTop: 6 }}
                            value={edit.condicion.valor_esperado}
                            onChange={(e) =>
                              setEdit({ ...edit, condicion: { ...edit.condicion, valor_esperado: e.target.value } })
                            }
                          >
                            <option value="true">si responde Sí</option>
                            <option value="false">si responde No</option>
                          </select>
                        )}
                      </td>
                      <td>{p.activa ? "Activa" : "Inactiva"}</td>
                      <td>
                        <button className="btn btn-primary" onClick={() => guardarEdicion(p.id)}>Guardar</button>
                        <button className="btn" style={{ marginLeft: 6 }} onClick={() => setEditandoId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{p.orden}</td>
                      <td>P{p.numero_reporte ?? p.orden}</td>
                      <td>{p.texto}</td>
                      <td>{TIPOS.find((t) => t.value === p.tipo)?.label || p.tipo}</td>
                      <td>{p.requiere_justificacion ? "Sí" : "No"}</td>
                      <td>{describirCondicion(p.condicion, nombrePregunta)}</td>
                      <td>
                        <span className={`badge ${p.activa ? "badge-completado" : "badge-fallido"}`}>
                          {p.activa ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td>
                        <button className="btn" onClick={() => empezarEdicion(p)}>Editar</button>
                        <button className="btn" style={{ marginLeft: 6 }} onClick={() => toggleActiva(p)}>
                          {p.activa ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card pad" style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 14px" }}>Agregar pregunta</h2>

        <label className="field-label">Texto</label>
        <textarea
          className="text-input"
          value={nuevo.texto}
          onChange={(e) => setNuevo({ ...nuevo, texto: e.target.value })}
        />

        <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
          <div>
            <label className="field-label">Tipo</label>
            <select
              className="text-input"
              value={nuevo.tipo}
              onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}
            >
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">N° en el documento del cliente</label>
            <input
              type="number"
              className="text-input"
              style={{ width: 90 }}
              placeholder="ej. 10"
              value={nuevo.numero_reporte}
              onChange={(e) => setNuevo({ ...nuevo, numero_reporte: e.target.value })}
            />
          </div>

          <div>
            <label className="field-label">¿Pide justificación?</label>
            <input
              type="checkbox"
              checked={nuevo.requiere_justificacion}
              onChange={(e) => setNuevo({ ...nuevo, requiere_justificacion: e.target.checked })}
              style={{ width: 20, height: 20 }}
            />
          </div>

          <div>
            <label className="field-label">Depende de</label>
            <select
              className="text-input"
              value={nuevo.condicion.pregunta_id}
              onChange={(e) =>
                setNuevo({ ...nuevo, condicion: { ...nuevo.condicion, pregunta_id: e.target.value } })
              }
            >
              <option value="">Sin condición</option>
              <option value={CLIENTE_TOTAL}>Dato del cliente: Total (si vacío, N/A)</option>
              {preguntas.map((x) => (
                <option key={x.id} value={x.id}>{nombrePregunta(x.id)}</option>
              ))}
            </select>
          </div>

          {nuevo.condicion.pregunta_id && nuevo.condicion.pregunta_id !== CLIENTE_TOTAL && (
            <div>
              <label className="field-label">Valor esperado</label>
              <select
                className="text-input"
                value={nuevo.condicion.valor_esperado}
                onChange={(e) =>
                  setNuevo({ ...nuevo, condicion: { ...nuevo.condicion, valor_esperado: e.target.value } })
                }
              >
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
          )}
        </div>

        {error && <p style={{ color: "#991b1b", fontSize: 13, marginTop: 12 }}>{error}</p>}

        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={crear} disabled={guardandoNuevo}>
          {guardandoNuevo ? "Guardando…" : "Agregar pregunta"}
        </button>
      </div>
    </div>
  );
}
