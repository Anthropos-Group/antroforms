// Next.js llama a register() una vez al arrancar el servidor: desde aquí se
// programan las tareas periódicas (keep-alive de Supabase y sincronización con
// Twenty), que así corren dentro del contenedor sin un cron externo.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { iniciarTareasProgramadas } = await import("./lib/programador");
  iniciarTareasProgramadas();
}
