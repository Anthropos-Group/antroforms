"use client";

// Controles de los tipos de pregunta del motor de rutas: opción única, selección
// múltiple (con opciones excluyentes), número, escala configurable e indicación.
// Los tipos de EDIMCA (Sí/No, escala 1–10, texto) siguen en app/encuesta/page.js.

import cantones from "../lib/catalogos/cantones-ec.json";

// Catálogos para autocompletar el detalle de una opción (`catalogo` en la opción).
const CATALOGOS = {
  cantones: cantones.map((c) => `${c.canton} (${c.provincia})`),
};

function CatalogoDatalist({ id }) {
  const valores = CATALOGOS[id];
  if (!valores) return null;
  return (
    <datalist id={`catalogo-${id}`}>
      {valores.map((v) => <option key={v} value={v} />)}
    </datalist>
  );
}

const ETIQUETA_ESPECIAL = { NS: "No sabe", NR: "Prefiere no responder" };

function esEspecial(val) {
  return val !== null && typeof val === "object" && (val.especial === "NS" || val.especial === "NR");
}

function BotonesEspeciales({ pregunta, valor, onChange }) {
  const especiales = pregunta.config?.especiales || [];
  if (!especiales.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      {especiales.map((e) => {
        const activo = esEspecial(valor) && valor.especial === e;
        return (
          <button
            key={e}
            type="button"
            className={`btn${activo ? " btn-primary" : ""}`}
            style={{ fontSize: 13 }}
            onClick={() => onChange(activo ? undefined : { especial: e })}
          >
            {ETIQUETA_ESPECIAL[e]}
          </button>
        );
      })}
    </div>
  );
}

function OpcionUnica({ pregunta, valor, onChange }) {
  const opciones = pregunta.config?.opciones || [];
  const elegido = esEspecial(valor) ? null : typeof valor === "object" && valor !== null ? valor.valor : valor;
  const opcionElegida = opciones.find((o) => o.valor === elegido);
  // en_fila: opciones cortas (escala 0–10) en una grilla; las largas debajo.
  const enFila = Boolean(pregunta.config?.en_fila);
  const cortas = enFila ? opciones.filter((o) => o.etiqueta.length <= 3) : [];
  const largas = enFila ? opciones.filter((o) => o.etiqueta.length > 3) : opciones;
  return (
    <div>
      {cortas.length > 0 && (
        <div className="scale-grid" style={{ gridTemplateColumns: `repeat(${cortas.length}, 1fr)`, marginBottom: 8 }}>
          {cortas.map((o) => (
            <button
              key={o.valor}
              type="button"
              className={`scale-btn${elegido === o.valor ? " selected" : ""}`}
              onClick={() => onChange(o.valor)}
            >
              {o.etiqueta}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {largas.map((o) => (
          <button
            key={o.valor}
            type="button"
            className={`btn${elegido === o.valor ? " btn-primary" : ""}`}
            style={{ textAlign: "left", justifyContent: "flex-start", padding: "10px 14px" }}
            onClick={() => onChange(o.con_texto ? { valor: o.valor, texto: valor?.texto || "" } : o.valor)}
          >
            {o.etiqueta}
          </button>
        ))}
      </div>
      {opcionElegida?.con_texto && (
        <input
          className="search-input"
          style={{ marginTop: 10 }}
          list={opcionElegida.catalogo ? `catalogo-${opcionElegida.catalogo}` : undefined}
          placeholder={opcionElegida.catalogo ? "Escriba para buscar en el catálogo…" : "Especifique…"}
          value={valor?.texto || ""}
          onChange={(e) => onChange({ valor: opcionElegida.valor, texto: e.target.value })}
        />
      )}
      {opcionElegida?.catalogo && <CatalogoDatalist id={opcionElegida.catalogo} />}
    </div>
  );
}

function SeleccionMultiple({ pregunta, valor, onChange }) {
  const opciones = pregunta.config?.opciones || [];
  const lista = esEspecial(valor) ? [] : Array.isArray(valor) ? valor : valor?.valores || [];
  const texto = Array.isArray(valor) ? "" : valor?.texto || "";
  const porValor = new Map(opciones.map((o) => [o.valor, o]));
  const necesitaTexto = lista.some((v) => porValor.get(v)?.con_texto);

  function emitir(nuevaLista, nuevoTexto = texto) {
    if (!nuevaLista.length) return onChange(undefined);
    const conTexto = nuevaLista.some((v) => porValor.get(v)?.con_texto);
    onChange(conTexto ? { valores: nuevaLista, texto: nuevoTexto } : nuevaLista);
  }

  function alternar(o) {
    if (lista.includes(o.valor)) return emitir(lista.filter((v) => v !== o.valor));
    // Una opción excluyente ("Ninguna") reemplaza a las demás, y viceversa.
    if (o.excluyente) return emitir([o.valor]);
    emitir([...lista.filter((v) => !porValor.get(v)?.excluyente), o.valor]);
  }

  return (
    <div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>Puede elegir varias opciones.</p>
      <div style={{ display: "grid", gap: 8 }}>
        {opciones.map((o) => {
          const activo = lista.includes(o.valor);
          return (
            <label
              key={o.valor}
              className="card"
              style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 14px", cursor: "pointer", borderColor: activo ? "#4f46e5" : undefined }}
            >
              <input type="checkbox" checked={activo} onChange={() => alternar(o)} />
              <span>{o.etiqueta}</span>
            </label>
          );
        })}
      </div>
      {necesitaTexto && (
        <input
          className="search-input"
          style={{ marginTop: 10 }}
          placeholder="Especifique…"
          value={texto}
          onChange={(e) => emitir(lista, e.target.value)}
        />
      )}
    </div>
  );
}

function Numero({ pregunta, valor, onChange }) {
  const { min, max, unidad } = pregunta.config || {};
  const actual = typeof valor === "number" ? String(valor) : "";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: 320 }}>
      {unidad && <span style={{ fontWeight: 600, color: "#475569" }}>{unidad}</span>}
      <input
        className="search-input"
        inputMode="decimal"
        placeholder={typeof min === "number" && typeof max === "number" ? `${min} – ${max}` : "Ingrese un número"}
        value={actual}
        onChange={(e) => {
          const limpio = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
          if (limpio === "") return onChange(undefined);
          const n = Number(limpio);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </div>
  );
}

function Escala({ pregunta, valor, onChange }) {
  const min = Number.isInteger(pregunta.config?.min) ? pregunta.config.min : 1;
  const max = Number.isInteger(pregunta.config?.max) ? pregunta.config.max : 10;
  const cal = esEspecial(valor) ? null : typeof valor === "object" && valor !== null ? valor.calificacion : valor;
  const just = typeof valor === "object" && valor !== null ? valor.justificacion ?? "" : "";
  const etiquetas = pregunta.config?.etiquetas || {};
  const valores = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="scale-grid" style={{ gridTemplateColumns: `repeat(${Math.min(valores.length, 11)}, 1fr)` }}>
        {valores.map((n) => (
          <button
            key={n}
            type="button"
            className={`scale-btn${cal === n ? " selected" : ""}`}
            onClick={() =>
              onChange(pregunta.requiere_justificacion ? { calificacion: n, justificacion: just } : { calificacion: n })
            }
          >
            {n}
          </button>
        ))}
      </div>
      {(etiquetas.min || etiquetas.max) && (
        <div className="scale-labels">
          <span className="scale-label-min">{etiquetas.min}</span>
          <span className="scale-label-max">{etiquetas.max}</span>
        </div>
      )}
      {pregunta.requiere_justificacion && (
        <div style={{ marginTop: 16 }}>
          <label className="field-label">¿Por qué?</label>
          <textarea
            value={just}
            onChange={(e) => onChange({ calificacion: cal ?? null, justificacion: e.target.value })}
            placeholder="Escribe el motivo…"
          />
        </div>
      )}
    </div>
  );
}

export const TIPOS_CON_CAMPOS = ["opcion_unica", "opcion_multiple", "numero", "escala", "informativa"];

export default function PreguntaCampos({ pregunta, valor, onChange }) {
  if (pregunta.tipo === "informativa") {
    return (
      <div className="script-box" style={{ margin: 0 }}>
        <span className="script-label">Indicación para el encuestador</span>
        {pregunta.ayuda || "Lea el texto y continúe."}
      </div>
    );
  }
  // Pregunta calculada (p. ej. la ruta): se muestra el resultado, no se elige.
  if (Array.isArray(pregunta.config?.calculo)) {
    const etiqueta = (pregunta.config.opciones || []).find((o) => o.valor === valor)?.etiqueta;
    return (
      <div className="script-box" style={{ margin: 0 }}>
        <span className="script-label">Se calcula automáticamente con las respuestas anteriores</span>
        <strong>{valor ? etiqueta || valor : "Aún sin datos suficientes"}</strong>
      </div>
    );
  }
  return (
    <div>
      {pregunta.tipo === "opcion_unica" && <OpcionUnica pregunta={pregunta} valor={valor} onChange={onChange} />}
      {pregunta.tipo === "opcion_multiple" && <SeleccionMultiple pregunta={pregunta} valor={valor} onChange={onChange} />}
      {pregunta.tipo === "numero" && <Numero pregunta={pregunta} valor={valor} onChange={onChange} />}
      {pregunta.tipo === "escala" && <Escala pregunta={pregunta} valor={valor} onChange={onChange} />}
      <BotonesEspeciales pregunta={pregunta} valor={valor} onChange={onChange} />
    </div>
  );
}
