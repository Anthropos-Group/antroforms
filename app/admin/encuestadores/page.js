"use client";

import { useEffect, useState } from "react";

export default function EncuestadoresPage() {
  const [encuestadores, setEncuestadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Estados para edición inline
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  function cargar() {
    setCargando(true);
    fetch("/api/encuestadores")
      .then((r) => r.json())
      .then((d) => setEncuestadores(d.encuestadores || []))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function agregar() {
    if (!nombreNuevo.trim()) return;
    setGuardando(true);
    await fetch("/api/encuestadores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nombreNuevo.trim() }),
    });
    setNombreNuevo("");
    setGuardando(false);
    cargar();
  }

  async function toggleActivo(e) {
    await fetch(`/api/encuestadores/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !e.activo }),
    });
    cargar();
  }

  function iniciarEdicion(e) {
    setEditandoId(e.id);
    setNombreEditado(e.nombre);
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setNombreEditado("");
  }

  async function guardarEdicion(id) {
    if (!nombreEditado.trim()) return;
    setGuardandoEdicion(true);
    try {
      await fetch(`/api/encuestadores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombreEditado.trim() }),
      });
      setEditandoId(null);
      setNombreEditado("");
      cargar();
    } finally {
      setGuardandoEdicion(false);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Encuestadores</h1>
      <p className="page-subtitle">
        Lista de personas que aparecen para seleccionar al levantar una encuesta (sin login individual).
      </p>

      <div className="card pad" style={{ display: "flex", gap: 12 }}>
        <input
          className="text-input"
          placeholder="Nombre del encuestador"
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()}
        />
        <button className="btn btn-primary" onClick={agregar} disabled={guardando}>
          {guardando ? "Agregando…" : "Agregar"}
        </button>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {cargando ? (
          <div className="empty-state">Cargando…</div>
        ) : encuestadores.length === 0 ? (
          <div className="empty-state">Sin encuestadores todavía.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {encuestadores.map((e) => {
                const esEditando = editandoId === e.id;
                return (
                  <tr key={e.id}>
                    <td>
                      {esEditando ? (
                        <div style={{ display: "flex", gap: 8, maxWidth: 300 }}>
                          <input
                            type="text"
                            className="text-input"
                            style={{ padding: "4px 8px", fontSize: 13 }}
                            value={nombreEditado}
                            onChange={(ev) => setNombreEditado(ev.target.value)}
                            onKeyDown={(ev) => ev.key === "Enter" && guardarEdicion(e.id)}
                            autoFocus
                          />
                          <button
                            className="btn btn-primary"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            onClick={() => guardarEdicion(e.id)}
                            disabled={guardandoEdicion}
                          >
                            ✓
                          </button>
                          <button
                            className="btn"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            onClick={cancelarEdicion}
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <span>{e.nombre}</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${e.activo ? "badge-completado" : "badge-fallido"}`}>
                        {e.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        {!esEditando && (
                          <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => iniciarEdicion(e)}>
                            ✏️ Editar
                          </button>
                        )}
                        <button className="btn" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => toggleActivo(e)}>
                          {e.activo ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
