import Link from "next/link";
import { connection } from "next/server";
import { tenant } from "../lib/tenant";

const ACCESOS = [
  {
    href: "/admin/preguntas",
    icon: "🛠️",
    title: "Panel de administración",
    desc: "Preguntas, encuestadores y administradores.",
  },
  {
    href: "/admin/reportes",
    icon: "📊",
    title: "Reportes de encuestas",
    desc: "Filtrar por fecha o encuestador y descargar Excel.",
  },
  {
    href: "/admin/sync",
    icon: "🔄",
    title: "Historial de limpieza de Twenty",
    desc: "Corridas del cron, registros modificados y detalle de cambios.",
  },
  {
    href: "/encuesta",
    icon: "📋",
    title: "Levantar encuesta",
    desc: "Buscar cliente, responder el cuestionario y cerrar el ciclo con Twenty.",
  },
];

export default async function Home() {
  await connection();
  const { marca } = tenant();
  return (
    <div className="container">
      <div className="login-brand" style={{ marginBottom: 30 }}>
        <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12, fontSize: 17 }}>{marca.inicial}</span>
        <div>
          <div className="login-brand-title">Sistema de Encuestas</div>
          <div className="login-brand-sub">{marca.subtitulo}</div>
        </div>
      </div>

      <div className="launch-grid">
        {ACCESOS.map((a) => (
          <Link key={a.href} href={a.href} className="launch-card">
            <span className="launch-card-icon">{a.icon}</span>
            <div className="launch-card-title">{a.title}</div>
            <div className="launch-card-desc">{a.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
