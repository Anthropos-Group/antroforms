"use client";

import { useEffect, useState } from "react";

export default function EncuestadoresPage() {
  const [encuestadores, setEncuestadores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {encuestadores.map((e) => (
                <tr key={e.id}>
                  <td>{e.nombre}</td>
                  <td>
                    <span className={`badge ${e.activo ? "badge-completado" : "badge-fallido"}`}>
                      {e.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => toggleActivo(e)}>
                      {e.activo ? "Desactivar" : "Activar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
