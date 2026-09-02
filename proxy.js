import { NextResponse } from "next/server";
import {
  verifySessionToken,
  SESSION_COOKIE,
  verifyEncuestadorSessionToken,
  ENCUESTADOR_SESSION_COOKIE,
} from "./lib/auth";

// Reglas para las APIs. Se evalúa en orden — la primera cuyo prefijo matchee
// Y cuyo método esté incluido, decide la protección de esa ruta.
// auth: "admin" (solo sesión de administrador) | "any" (admin o encuestador)
const RULES = [
  { prefix: "/api/administradores", methods: "all", auth: "admin" },
  { prefix: "/api/encuestas/export", methods: "all", auth: "admin" },
  { prefix: "/api/encuestas", methods: ["GET"], auth: "admin" },
  { prefix: "/api/encuestas", methods: ["POST"], auth: "any" },
  { prefix: "/api/preguntas", methods: "all", auth: "admin" },
  { prefix: "/api/encuestadores", methods: ["POST", "PATCH", "DELETE"], auth: "admin" },
  { prefix: "/api/encuestadores", methods: ["GET"], auth: "any" },
  { prefix: "/api/clientes", methods: "all", auth: "any" },
  { prefix: "/api/cuestionarios/activo", methods: "all", auth: "any" },
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

function sesionActual(request) {
  const adminToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (verifySessionToken(adminToken)) return "admin";
  const encToken = request.cookies.get(ENCUESTADOR_SESSION_COOKIE)?.value;
  if (verifyEncuestadorSessionToken(encToken)) return "encuestador";
  return null;
}

function irALogin(request, pathname) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const esHome = pathname === "/";
  const esPaginaAdmin = pathname.startsWith("/admin");
  const esPaginaEncuesta = pathname.startsWith("/encuesta");
  const regla = reglaAplicable(pathname, request.method);

  if (!esHome && !esPaginaAdmin && !esPaginaEncuesta && !regla) {
    return NextResponse.next();
  }

  const sesion = sesionActual(request);

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
    "/api/administradores/:path*",
    "/api/preguntas/:path*",
    "/api/encuestadores/:path*",
    "/api/encuestas/:path*",
    "/api/clientes/:path*",
    "/api/cuestionarios/:path*",
    "/api/monitoreo/:path*",
  ],
};
