"use client";

import { useEffect, useState } from "react";

function nombrePeriodo(periodo) {
  if (!periodo) return "—";
  const [anio, mes] = periodo.split("-").map(Number);
  const texto = new Date(anio, mes - 1, 1).toLocaleDateString("es-EC", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function sumarMes(periodo, n) {
  const [anio, mes] = periodo.split("-").map(Number);
  const d = new Date(anio, mes - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "2026-10-26T13:00:00.000Z" → valor para <input type="datetime-local"> en hora local.
function aInputLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ORIGEN = {
  automatico: "se activó solo al detectar la base cargada",
  manual: "fijado manualmente",
  calendario: "mes calendario en curso",
};

// Parámetro "mes de gestión activo": el único mes cuyos clientes ven y encuestan
// los encuestadores (ver lib/gestion.js).
export default function MesGestionConfig() {
  const [estado, setEstado] = useState(null);
  const [form, setForm] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  function aplicar(d) {
    setEstado(d);
    setForm({
      modo: d.config.modo,
      umbral: d.config.umbral ?? 100,
      periodo: d.config.periodo || d.siguiente.periodo,
      desde: aInputLocal(d.config.desde),
    });
  }

  useEffect(() => {
    fetch("/api/admin/mes-gestion")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
        aplicar(d);
      })
      .catch((err) => setMensaje({ ok: false, texto: err.message }));
  }, []);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const body =
        form.modo === "manual"
          ? { modo: "manual", periodo: form.periodo, desde: form.desde ? new Date(form.desde).toISOString() : null }
          : { modo: "automatico", umbral: Number(form.umbral) };
      const res = await fetch("/api/admin/mes-gestion", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      aplicar(d);
      setMensaje({ ok: true, texto: "✓ Guardado. Los encuestadores lo ven en menos de un minuto." });
    } catch (err) {
      setMensaje({ ok: false, texto: err.message });
    } finally {
      setGuardando(false);
    }
  }

  if (!estado || !form) {
    return (
      <div className="card pad" style={{ marginBottom: 20 }}>
        {mensaje ? <span style={{ color: "#991b1b" }}>{mensaje.texto}</span> : "Cargando mes de gestión…"}
      </div>
    );
  }

  const opcionesMes = [0, 1, 2].map((n) => sumarMes(estado.calendario, n));

  return (
    <div className="card pad" style={{ marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Mes de gestión activo</h2>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6b7280" }}>
        Los encuestadores solo ven y encuestan clientes de este mes. Así un cliente repetido en dos meses no se
        encuesta en el registro equivocado.
      </p>
      <div style={{ fontSize: 15, marginBottom: 14 }}>
        Ahora: <strong>{estado.nombre}</strong> ({nombrePeriodo(estado.periodo)}) · {ORIGEN[estado.origen]}
      </div>

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10, fontSize: 14 }}>
        <input type="radio" checked={form.modo === "automatico"} onChange={() => setForm({ ...form, modo: "automatico" })} />
        <span>
          <strong>Automático</strong>: el mes siguiente se activa solo en cuanto se carga su base en Twenty (al menos{" "}
          <input
            type="number"
            min={1}
            className="text-input"
            style={{ width: 80, display: "inline-block", padding: "2px 6px" }}
            value={form.umbral}
            onChange={(e) => setForm({ ...form, umbral: e.target.value, modo: "automatico" })}
          />{" "}
          clientes). Hoy {estado.siguiente.nombre} tiene <strong>{estado.siguiente.cargados}</strong> clientes cargados.
        </span>
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 14, fontSize: 14 }}>
        <input type="radio" checked={form.modo === "manual"} onChange={() => setForm({ ...form, modo: "manual" })} />
        <span>
          <strong>Manual</strong>: activar{" "}
          <select
            className="text-input"
            style={{ width: "auto", display: "inline-block", padding: "2px 6px" }}
            value={form.periodo}
            onChange={(e) => setForm({ ...form, periodo: e.target.value, modo: "manual" })}
          >
            {opcionesMes.map((p) => (
              <option key={p} value={p}>
                {nombrePeriodo(p)}
              </option>
            ))}
          </select>{" "}
          desde{" "}
          <input
            type="datetime-local"
            className="text-input"
            style={{ width: "auto", display: "inline-block", padding: "2px 6px" }}
            value={form.desde}
            onChange={(e) => setForm({ ...form, desde: e.target.value, modo: "manual" })}
          />{" "}
          (vacío = ya).
        </span>
      </label>

      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>
        En cualquier modo, el día 1 de cada mes se pasa al mes nuevo aunque nadie haga nada.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-primary" disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {mensaje && <span style={{ fontSize: 13, color: mensaje.ok ? "#065f46" : "#991b1b" }}>{mensaje.texto}</span>}
      </div>
    </div>
  );
}
