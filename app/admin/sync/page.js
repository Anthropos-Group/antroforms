import Link from "next/link";
import { getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

async function getRuns() {
  const pool = getPool();
  const { rows } = await pool.query(`
    select id, tipo, estado, iniciado_en, finalizado_en,
           registros_escaneados, registros_modificados, errores
    from sync_runs
    order by iniciado_en desc
    limit 30
  `);
  return rows;
}

function duracion(run) {
  if (!run.finalizado_en) return "en curso…";
  const ms = new Date(run.finalizado_en) - new Date(run.iniciado_en);
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default async function SyncHistoryPage() {
  const runs = await getRuns();

  return (
    <div className="container">
      <Link href="/" className="back-link">← Inicio</Link>
      <h1 className="page-title">Historial de limpieza de Twenty</h1>
      <p className="page-subtitle">
        Cada corrida revisa el objeto <code>people</code> de Twenty y corrige espacios y valores
        sucios. En modo <em>dry_run</em> solo se registra lo que cambiaría, sin escribir en Twenty.
      </p>

      <div className="card">
        {runs.length === 0 ? (
          <div className="empty-state">Todavía no hay corridas registradas.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Inicio</th>
                <th>Modo</th>
                <th>Estado</th>
                <th>Escaneados</th>
                <th>Con cambios</th>
                <th>Errores</th>
                <th>Duración</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.iniciado_en).toLocaleString("es-EC")}</td>
                  <td><span className={`badge badge-mode-${r.tipo}`}>{r.tipo}</span></td>
                  <td><span className={`badge badge-${r.estado}`}>{r.estado}</span></td>
                  <td>{r.registros_escaneados}</td>
                  <td>{r.registros_modificados}</td>
                  <td>{r.errores}</td>
                  <td>{duracion(r)}</td>
                  <td><Link href={`/admin/sync/${r.id}`}>ver cambios →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
