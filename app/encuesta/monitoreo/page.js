"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function mesActualISO() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function nombreMesLargo(yyyyMm) {
  const [anio, mes] = yyyyMm.split("-").map(Number);
  const fecha = new Date(anio, mes - 1, 1);
  const texto = fecha.toLocaleDateString("es-EC", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function estadoPdv(completadas, meta) {
  if (completadas >= meta) return { label: "Meta cumplida", clase: "badge-completado" };
  if (completadas > 0) return { label: "En progreso", clase: "badge-mode-incremental" };
  return { label: "Sin avance", clase: "badge-fallido" };
}

export default function EncuestadorMonitoreoPage() {
  const router = useRouter();
  const [mes] = useState(mesActualISO());
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const res = await fetch(`/api/monitoreo?mes=${mes}`);
      const d = await res.json();

      // Si quien accede es un administrador, redirigir inmediatamente a la vista de administración
      if (d.rol === "admin") {
        router.replace("/admin/monitoreo");
        return;
      }

      setData(d);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pdvs = data?.pdvs || [];
  const meta = data?.meta_por_pdv || 25;

  return (
    <div className="container">
      <h1 className="page-title">Monitoreo por PDV</h1>
      <p className="page-subtitle">
        {data ? nombreMesLargo(mes) : "Cargando…"} · meta de {meta} encuestas completadas por sucursal.
      </p>

      {/* Avance por Sucursal para Encuestador */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="pad" style={{ paddingBottom: 0 }}>
          <h2 className="section-title">Avance por sucursal</h2>
          <p className="section-subtitle">Mostrando únicamente sucursales con registros en el mes de gestión.</p>
        </div>

        {cargando ? (
          <div className="empty-state">Cargando datos…</div>
        ) : pdvs.length === 0 ? (
          <div className="empty-state">No existen encuestas registradas para las sucursales en este mes.</div>
        ) : (
          <>
            <div className="pdv-table-head">
              <div>Sucursal</div>
              <div>Progreso</div>
              <div>Completadas</div>
              <div>Estado</div>
            </div>
            {pdvs.map((p) => {
              const pct = Math.min(100, Math.round((p.completadas / meta) * 100));
              const completo = p.completadas >= meta;
              const estado = estadoPdv(p.completadas, meta);
              return (
                <div key={p.pdv} className="pdv-row">
                  <div className="pdv-name">{p.pdv}</div>
                  <div className="pdv-bar-track">
                    <div className={`pdv-bar-fill${completo ? " completo" : ""}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="pdv-count">{p.completadas} / {meta}</div>
                  <div><span className={`badge ${estado.clase}`}>{estado.label}</span></div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
