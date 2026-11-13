"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTenant } from "./TenantProvider";

export default function EncuestaNav() {
  const tenant = useTenant();
  const LINKS = [
    { href: "/encuesta", label: "Encuesta" },
    { href: "/encuesta/monitoreo", label: `Monitoreo por ${tenant.etiquetas.grupo}` },
  ];
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await Promise.all([
      fetch("/api/encuestador/logout", { method: "POST" }),
      fetch("/api/admin/logout", { method: "POST" }),
    ]);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="tab-nav">
      <div className="tab-nav-inner">
        <div style={{ display: "flex", alignItems: "center" }}>
          <div className="tab-brand">
            <span className="brand-mark">{tenant.marca.inicial}</span>
          </div>
          <nav className="tab-links">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname === l.href ? "tab-link-active" : "tab-link-inactive"}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <button className="btn" style={{ fontSize: 13, padding: "6px 12px" }} onClick={logout}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
