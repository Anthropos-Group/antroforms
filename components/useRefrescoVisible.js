"use client";

import { useEffect, useRef } from "react";

// Refresco periódico de un tablero: llama a `refrescar` cada `ms` solo mientras la
// pestaña está visible, y una vez al volver a ella. Una pestaña olvidada en segundo
// plano no sigue consultando al servidor (con varios encuestadores, eran muchas
// consultas pesadas por minuto para pantallas que nadie miraba).
export function useRefrescoVisible(refrescar, ms, deps = []) {
  const ultima = useRef(refrescar);
  ultima.current = refrescar;

  useEffect(() => {
    const siVisible = () => {
      if (!document.hidden) ultima.current();
    };
    const intervalo = setInterval(siVisible, ms);
    document.addEventListener("visibilitychange", siVisible);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", siVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps]);
}
