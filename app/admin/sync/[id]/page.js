import Link from "next/link";
import { getPool } from "../../../../lib/db";
import { formatFechaHoraEcuador } from "../../../../lib/fecha";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

async function getRunWithChanges(id) {
  if (!UUID.test(id)) return { run: null, changes: [] };
  const pool = getPool();
  const { rows: runRows } = await pool.query(`select * from sync_runs where id = $1`, [id]);
  const { rows: changeRows } = await pool.query(
    `select id_twenty, campo, valor_antes, valor_despues, created_at
     from sync_changes where sync_run_id = $1
     order by created_at asc
     limit 500`,
    [id]
  );
  return { run: runRows[0], changes: changeRows };
}

export default async function SyncRunDetailPage({ params }) {
  const { id } = await params;
  const { run, changes } = await getRunWithChanges(id);

  if (!run) {
    return (
      <div className="container">
        <Link href="/admin/sync" className="back-link">← Historial</Link>
        <p>Corrida no encontrada.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <Link href="/admin/sync" className="back-link">← Historial</Link>
      <h1 className="page-title">
        Corrida {run.tipo} — <span className={`badge badge-${run.estado}`}>{run.estado}</span>
      </h1>
      <p className="page-subtitle">
        {formatFechaHoraEcuador(run.iniciado_en)} · {run.registros_escaneados} escaneados,{" "}
        {run.registros_modificados} con cambios, {run.errores} errores
        {changes.length === 500 && " (mostrando los primeros 500 cambios)"}
      </p>

      {run.detalle && (
        <div className="card pad" style={{ marginBottom: 16, borderColor: "#fecaca", background: "#fef2f2" }}>
          <strong style={{ color: "#991b1b" }}>Detalle de errores</strong>
          <pre className="mono" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 12, color: "#7f1d1d" }}>
            {run.detalle}
          </pre>
        </div>
      )}

      <div className="card">
        {changes.length === 0 ? (
          <div className="empty-state">Sin cambios detectados en esta corrida (todavía).</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Cliente (Twenty id)</th>
                <th>Campo</th>
                <th>Antes</th>
                <th>Después</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={`${c.id_twenty}-${c.campo}-${i}`}>
                  <td className="mono">{c.id_twenty.slice(0, 8)}…</td>
                  <td>{c.campo}</td>
                  <td className="mono diff-before">&quot;{c.valor_antes}&quot;</td>
                  <td className="mono diff-after">&quot;{c.valor_despues}&quot;</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
