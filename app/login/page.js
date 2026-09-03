"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("encuestador");

  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  function elegirTab(t) {
    setTab(t);
    setError("");
  }

  async function loginEncuestador(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const res = await fetch("/api/encuestador/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "No se pudo ingresar");
        return;
      }
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/encuesta") ? next : "/encuesta");
      router.refresh();
    } finally {
      setCargando(false);
    }
  }

  async function loginAdmin(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: adminPassword }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "No se pudo ingresar");
        return;
      }
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/admin") ? next : "/admin/preguntas");
      router.refresh();
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card-wrap">
        <div className="login-brand">
          <span className="brand-mark" style={{ width: 40, height: 40, borderRadius: 12, fontSize: 17 }}>E</span>
          <div>
            <div className="login-brand-title">Sistema de Encuestas</div>
            <div className="login-brand-sub">EDIMCA · Antroproyectos</div>
          </div>
        </div>

        <div className="card pad">
          <div className="tab-switch">
            <button
              type="button"
              className={`tab-switch-btn${tab === "encuestador" ? " active" : ""}`}
              onClick={() => elegirTab("encuestador")}
            >
              Encuestador
            </button>
            <button
              type="button"
              className={`tab-switch-btn${tab === "admin" ? " active" : ""}`}
              onClick={() => elegirTab("admin")}
            >
              Administrador
            </button>
          </div>

          {tab === "encuestador" ? (
            <form onSubmit={loginEncuestador}>
              <label className="field-label">Contraseña del equipo</label>
              <input
                type="password"
                className="text-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              {error && <p style={{ color: "#991b1b", fontSize: 13, marginTop: 12 }}>{error}</p>}
              <button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} disabled={cargando}>
                {cargando ? "Ingresando…" : "Ingresar"}
              </button>
            </form>
          ) : (
            <form onSubmit={loginAdmin}>
              <label className="field-label">Email</label>
              <input
                type="email"
                className="text-input"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
              <div style={{ height: 14 }} />
              <label className="field-label">Contraseña</label>
              <input
                type="password"
                className="text-input"
                autoComplete="current-password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
              />
              {error && <p style={{ color: "#991b1b", fontSize: 13, marginTop: 12 }}>{error}</p>}
              <button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} disabled={cargando}>
                {cargando ? "Ingresando…" : "Ingresar"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
