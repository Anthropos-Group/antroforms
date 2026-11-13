"use client";

// Tablero de avance para levantamientos sin mes de gestión (Cooperativa 23 de
// Julio): por oficina, por resultado de llamada y por encuestador.
import { useTenant } from "./TenantProvider";

const ETIQUETA_RESULTADO = {
  completa: "Completa",
  rechazo: "Rechazo",
  parcial: "Parcial",
  cita: "Cita",
  no_contacto: "No contacto",
  numero_incorrecto: "Número incorrecto",
  informante_no_autorizado: "Informante no autorizado",
  fuera_universo: "Fuera del universo",
  cortada: "Cortada",
};

function Kpi({ titulo, valor, detalle }) {
  return (
    <div className="card pad" style={{ flex: "1 1 160px" }}>
      <div style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", fontWeight: 700 }}>{titulo}</div>
      <div style={{ fontSize: 28, fontWeight: 700, margin: "4px 0" }}>{valor}</div>
      {detalle && <div style={{ fontSize: 12, color: "#6b7280" }}>{detalle}</div>}
    </div>
  );
}

export default function AvanceLevantamiento({ data }) {
  const tenant = useTenant();
  const grupos = data?.grupos || [];
  const suma = (k) => grupos.reduce((acc, g) => acc + (g[k] || 0), 0);
  const base = suma("base");
  const completas = suma("completas");
  const llamadas = (data?.resultados || []).reduce((acc, r) => acc + r.llamadas, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi titulo="Encuestas completas" valor={completas} detalle={`de ${base} socios en la base`} />
        <Kpi titulo="En gestión" valor={suma("en_gestion")} detalle="parcial, cita, no contacto…" />
        <Kpi titulo="Rechazos" valor={suma("rechazos")} />
        <Kpi titulo="Descartados" valor={suma("descartados")} detalle="número incorrecto o fuera del universo" />
        <Kpi titulo="Llamadas registradas" valor={llamadas} />
      </div>

      <div className="card" style={{ marginBottom: 16, overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>{tenant.etiquetas.grupo}</th>
              <th>Ciudad</th>
              <th style={{ textAlign: "right" }}>Base</th>
              <th style={{ textAlign: "right" }}>Completas</th>
              <th style={{ textAlign: "right" }}>En gestión</th>
              <th style={{ textAlign: "right" }}>Rechazos</th>
              <th style={{ textAlign: "right" }}>Descartados</th>
              <th style={{ textAlign: "right" }}>Sin llamar</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.grupo}>
                <td><strong>{g.grupo}</strong></td>
                <td>{g.ciudad || "—"}</td>
                <td style={{ textAlign: "right" }}>{g.base}</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#059669" }}>{g.completas}</td>
                <td style={{ textAlign: "right" }}>{g.en_gestion}</td>
                <td style={{ textAlign: "right" }}>{g.rechazos}</td>
                <td style={{ textAlign: "right" }}>{g.descartados}</td>
                <td style={{ textAlign: "right", color: "#6b7280" }}>{g.sin_llamar}</td>
              </tr>
            ))}
            {grupos.length === 0 && (
              <tr><td colSpan={8} className="empty-state">Todavía no hay socios cargados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="card pad" style={{ flex: "1 1 300px" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Llamadas por resultado</h3>
          {(data?.resultados || []).map((r) => (
            <div key={r.resultado} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>{ETIQUETA_RESULTADO[r.resultado] || r.resultado}</span>
              <strong>{r.llamadas}</strong>
            </div>
          ))}
          {!(data?.resultados || []).length && <div className="empty-state">Sin llamadas todavía.</div>}
        </div>
        <div className="card pad" style={{ flex: "1 1 300px" }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Por encuestador</h3>
          {(data?.encuestadores || []).map((e) => (
            <div key={e.nombre} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>{e.nombre}</span>
              <span>
                <strong>{e.completas}</strong> completas · {e.llamadas} llamadas · {e.hoy} hoy
              </span>
            </div>
          ))}
          {!(data?.encuestadores || []).length && <div className="empty-state">Sin llamadas todavía.</div>}
        </div>
      </div>
    </div>
  );
}
