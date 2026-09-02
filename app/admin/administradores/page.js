"use client";

import { useEffect, useState } from "react";

export default function AdministradoresPage() {
  const [administradores, setAdministradores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    setCargando(true);
    fetch("/api/administradores")
      .then((r) => r.json())
      .then((d) => setAdministradores(d.administradores || []))
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function agregar() {
    setError("");
    if (!nuevo.nombre.trim() || !nuevo.email.trim() || !nuevo.password) {
      setError("Completa nombre, email y contraseña");
      return;
    }
    setGuardando(true);
    const res = await fetch("/api/administradores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevo),
    });
    setGuardando(false);
    if (res.ok) {
      setNuevo({ nombre: "", email: "", password: "" });
      cargar();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo crear el administrador");
    }
  }

  async function toggleActivo(a) {
    await fetch(`/api/administradores/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !a.activo }),
    });
    cargar();
  }

  return (
    <div className="container">
      <h1 className="page-title">Administradores</h1>
      <p className="page-subtitle">
        Quiénes tienen acceso con usuario y contraseña a este panel.
      </p>

      <div className="card pad">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <input
            className="text-input"
            style={{ flex: 1, minWidth: 160 }}
            placeholder="Nombre"
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
          />
          <input
            className="text-input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Email"
            type="email"
            value={nuevo.email}
            onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
          />
          <input
            className="text-input"
            style={{ flex: 1, minWidth: 160 }}
            placeholder="Contraseña (mín. 8 caracteres)"
            type="password"
            value={nuevo.password}
            onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
          />
          <button className="btn btn-primary" onClick={agregar} disabled={guardando}>
            {guardando ? "Agregando…" : "Agregar"}
          </button>
        </div>
        {error && <p style={{ color: "#991b1b", fontSize: 13, marginTop: 10 }}>{error}</p>}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        {cargando ? (
          <div className="empty-state">Cargando…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {administradores.map((a) => (
                <tr key={a.id}>
                  <td>{a.nombre}</td>
                  <td>{a.email}</td>
                  <td>
                    <span className={`badge ${a.activo ? "badge-completado" : "badge-fallido"}`}>
                      {a.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <button className="btn" onClick={() => toggleActivo(a)}>
                      {a.activo ? "Desactivar" : "Activar"}
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
