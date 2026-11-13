"use client";

import { createContext, useContext } from "react";

// Datos públicos del cliente de este despliegue (nombre, marca, etiquetas). Los
// entrega el layout raíz, que los lee del servidor en cada solicitud: así la misma
// imagen de Docker sirve a cualquier cliente cambiando solo la variable TENANT.
const TenantContext = createContext(null);

export function TenantProvider({ value, children }) {
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  return (
    useContext(TenantContext) || {
      id: "edimca",
      nombre: "EDIMCA",
      marca: { inicial: "E", subtitulo: "EDIMCA · Antroproyectos" },
      etiquetas: { grupo: "PDV", grupoPlural: "PDV", idExterno: "ID EDIMCA" },
      gestionMensual: true,
      metaPorGrupo: true,
      estados: { completada: "EFECTIVA", rechazo: "NO_LLAMAR" },
      cierres: [],
      estadosExcluidos: ["NO_LLAMAR", "YA_LE_REALIZARON_LA_ENCUESTA"],
    }
  );
}
