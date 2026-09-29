import { NextResponse } from "next/server";
import {
  verifySessionToken,
  SESSION_COOKIE,
  verifyEncuestadorSessionToken,
  ENCUESTADOR_SESSION_COOKIE,
  adminSigueActivo,
} from "./lib/auth";
import { getPool } from "./lib/db";

// Reglas para las APIs. Se evalúa en orden — la primera cuyo prefijo matchee
// Y cuyo método esté incluido, decide la protección de esa ruta.
// auth: "admin" (solo sesión de administrador) | "any" (admin o encuestador)
const RULES = [
  { prefix: "/api/admin/import", methods: "all", auth: "admin" },
  { prefix: "/api/admin/twenty-pendientes", methods: "all", auth: "admin" },
  { prefix: "/api/admin/sync-runs", methods: "all", auth: "admin" },
  { prefix: "/api/admin/refrescar-clientes", methods: "all", auth: "admin" },
  { prefix: "/api/administradores", methods: "all", auth: "admin" },
  { prefix: "/api/encuestas/export", methods: "all", auth: "admin" },
  { prefix: "/api/encuestas", methods: ["GET"], auth: "admin" },
  { prefix: "/api/encuestas", methods: ["POST"], auth: "any" },
  { prefix: "/api/preguntas", methods: "all", auth: "admin" },
  { prefix: "/api/encuestadores", methods: ["POST", "PATCH", "DELETE"], auth: "admin" },
  { prefix: "/api/encuestadores", methods: ["GET"], auth: "any" },
  { prefix: "/api/clientes", methods: "all", auth: "any" },
  { prefix: "/api/cuestionarios/activo", methods: ["PATCH"], auth: "admin" },
  { prefix: "/api/cuestionarios/activo", methods: ["GET"], auth: "any" },
  { prefix: "/api/monitoreo", methods: "all", auth: "any" },
];

function reglaAplicable(pathname, method) {
  for (const rule of RULES) {
    if (pathname.startsWith(rule.prefix) && (rule.methods === "all" || rule.methods.includes(method))) {
      return rule;
    }
  }
  return null;
}

async function sesionActual(request) {
  const adminId = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (adminId) {
    // El token firmado dura 12 h: además se confirma que el admin siga activo,
    // para que desactivarlo en el panel le corte el acceso (caché de 60 s).
    try {
      if (await adminSigueActivo(adminId, getPool)) return "admin";
    } catch (err) {
      console.error("No se pudo verificar la sesión de administrador:", err.message);
    }
  }
  const encToken = request.cookies.get(ENCUESTADOR_SESSION_COOKIE)?.value;
  if (verifyEncuestadorSessionToken(encToken)) return "encuestador";
  return null;
}

function irALogin(request, pathname) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    const sesion = await sesionActual(request);
    if (sesion === "encuestador") return NextResponse.redirect(new URL("/encuesta", request.url));
    if (sesion === "admin") return NextResponse.redirect(new URL("/admin/preguntas", request.url));
    return NextResponse.next();
  }

  const esHome = pathname === "/";
  const esPaginaAdmin = pathname.startsWith("/admin");
  const esPaginaEncuesta = pathname.startsWith("/encuesta");
  const regla = reglaAplicable(pathname, request.method);

  if (!esHome && !esPaginaAdmin && !esPaginaEncuesta && !regla) {
    return NextResponse.next();
  }

  const sesion = await sesionActual(request);

  // Si un administrador intenta acceder a páginas de encuestador (/encuesta), redirigirlo a /admin
  if (esPaginaEncuesta && sesion === "admin") {
    if (pathname.startsWith("/encuesta/monitoreo")) {
      return NextResponse.redirect(new URL("/admin/monitoreo", request.url));
    }
    return NextResponse.redirect(new URL("/admin/preguntas", request.url));
  }

  // El login es lo primero que ve cualquiera sin sesión, sea cual sea la ruta.
  if (esHome) {
    if (!sesion) return irALogin(request, pathname);
    if (sesion === "encuestador") return NextResponse.redirect(new URL("/encuesta", request.url));
    return NextResponse.next(); // admin ve el directorio normal
  }

  const requiereAdmin = esPaginaAdmin || regla?.auth === "admin";
  const requiereCualquiera = esPaginaEncuesta || regla?.auth === "any";
  const autorizado = requiereAdmin ? sesion === "admin" : requiereCualquiera ? sesion !== null : true;

  if (autorizado) return NextResponse.next();

  if (regla) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return irALogin(request, pathname);
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/encuesta/:path*",
    "/api/admin/import",
    "/api/admin/twenty-pendientes",
    "/api/admin/sync-runs/:path*",
    "/api/admin/refrescar-clientes",
    "/api/administradores/:path*",
    "/api/preguntas/:path*",
    "/api/encuestadores/:path*",
    "/api/encuestas/:path*",
    "/api/clientes/:path*",
    "/api/cuestionarios/:path*",
    "/api/monitoreo/:path*",
  ],
};
