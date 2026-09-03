"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/admin/preguntas", label: "Preguntas", icon: "📋" },
  { href: "/admin/encuestadores", label: "Encuestadores", icon: "🧑‍💼" },
  { href: "/admin/administradores", label: "Administradores", icon: "🔐" },
  { href: "/admin/reportes", label: "Reportes", icon: "📊" },
  { href: "/encuesta/monitoreo", label: "Monitoreo por PDV", icon: "📈" },
  { href: "/admin/sync", label: "Historial Twenty", icon: "🔄" },
];

export default function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">E</span>
        <div>
          <div className="sidebar-brand-title">EDIMCA</div>
          <div className="sidebar-brand-sub">Panel admin</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {LINKS.map((l) => {
          const active = pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} className={`sidebar-link${active ? " active" : ""}`}>
              <span className="sidebar-link-icon">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>

      <button className="sidebar-logout" onClick={logout}>
        Cerrar sesión
      </button>
    </aside>
  );
}
