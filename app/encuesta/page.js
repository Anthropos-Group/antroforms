"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NA,
  tieneDatoCliente,
  evaluarAutoRespuestas,
  reconciliarAutoRespuestas,
  evaluarCortePrematuro,
  respuestaCompleta,
  prepararEnvio,
} from "../../lib/encuesta-logica";

// Resultados de llamada que se registran desde la app sin hacer la encuesta: cambian
// el estado del cliente directamente en Twenty.
const RESULTADOS_LLAMADA = [
  { valor: "NO_CONTESTA", etiqueta: "No contesta" },
  { valor: "VOLVER_A_LLAMAR", etiqueta: "Volver a llamar" },
  { valor: "NO_DISPONIBLE", etiqueta: "No disponible" },
  { valor: "INCORRECTO", etiqueta: "Número incorrecto" },
  { valor: "NO_LLAMAR", etiqueta: "No desea ser contactado" },
];

function armarGuion(texto, valores) {
  if (!texto) return "";
  return texto
    .replaceAll("{{ENCUESTADOR}}", valores.encuestador || "—")
    .replaceAll("{{SUCURSAL}}", valores.sucursal || "—")
    .replaceAll("{{FECHA}}", valores.fecha || "—");
}

function formatFecha(valor) {
  if (!valor) return "";
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function obtenerEtiquetasEscala(textoPregunta = "") {
  const lower = textoPregunta.toLowerCase();
  if (lower.includes("recomendaría") || lower.includes("recomendar")) {
    return { min: "1 - Menos recomendado", max: "10 - Más recomendado" };
  }
  if (lower.includes("satisfecho") || lower.includes("satisfacción")) {
    return { min: "1 - Nada satisfecho", max: "10 - Muy satisfecho" };
  }
  return { min: "1 - Mínimo (Menos recomendado)", max: "10 - Máximo (Más recomendado)" };
}

const DRAFTS_KEY = "antroforms_borradores";
const ENCUESTADOR_KEY = "antroforms_encuestador";
// Borradores más viejos que esto se descartan solos (el cliente seguramente ya
// fue gestionado y la lista crecería sin límite en el navegador).
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function getBorradoresFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    const limite = Date.now() - DRAFT_TTL_MS;
    const vigentes = list.filter((b) => !b.updatedAt || new Date(b.updatedAt).getTime() > limite);
    if (vigentes.length !== list.length) localStorage.setItem(DRAFTS_KEY, JSON.stringify(vigentes));
    return vigentes;
  } catch (err) {
    console.error("Error leyendo borradores de localStorage:", err);
    return [];
  }
}

function leerEncuestadorRecordado() {
  try {
    return localStorage.getItem(ENCUESTADOR_KEY) || "";
  } catch {
    return "";
  }
}

function recordarEncuestador(id) {
  try {
    if (id) localStorage.setItem(ENCUESTADOR_KEY, id);
    else localStorage.removeItem(ENCUESTADOR_KEY);
  } catch {
    // Almacenamiento bloqueado (modo privado): solo se pierde la comodidad.
  }
}

// fetch que manda al login si la sesión expiró (12 h) en vez de mostrar listas vacías.
async function fetchSesion(url, options, onExpirada) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    onExpirada();
    throw new Error("Sesión expirada");
  }
  return res;
}

function saveBorradorToStorage(borrador) {
  if (typeof window === "undefined" || !borrador || !borrador.id) return;
  try {
    const list = getBorradoresFromStorage();
    const existingIndex = list.findIndex((b) => b.id === borrador.id);
    const updatedBorrador = { ...borrador, updatedAt: new Date().toISOString() };
    if (existingIndex >= 0) {
      list[existingIndex] = updatedBorrador;
    } else {
      list.unshift(updatedBorrador);
    }
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error("Error guardando borrador en localStorage:", err);
  }
}

function deleteBorradorFromStorage(id) {
  if (typeof window === "undefined" || !id) return;
  try {
    const list = getBorradoresFromStorage();
    const filtered = list.filter((b) => b.id !== id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("Error eliminando borrador de localStorage:", err);
  }
}

const PASOS = [
  { key: "encuestador", label: "Encuestador" },
  { key: "cliente", label: "Cliente" },
  { key: "cuestionario", label: "Cuestionario" },
];

function Stepper({ paso }) {
  const indiceActual = PASOS.findIndex((p) => p.key === paso);
  return (
    <div className="stepper">
      {PASOS.map((p, i) => (
        <div key={p.key} style={{ display: "flex", alignItems: "center" }}>
          <div className={`stepper-item${i === indiceActual ? " active" : i < indiceActual ? " done" : ""}`}>
            <span className="stepper-dot">{i < indiceActual ? "✓" : i + 1}</span>
            {p.label}
          </div>
          {i < PASOS.length - 1 && <div className={`stepper-line${i < indiceActual ? " done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

export default function EncuestaPage() {
  const router = useRouter();
  const [step, setStep] = useState("encuestador");

  const [encuestadores, setEncuestadores] = useState([]);
  const [encuestadorId, setEncuestadorId] = useState("");
  const [borradores, setBorradores] = useState([]);

  const [cuestionario, setCuestionario] = useState(null);
  const [cargandoCuestionario, setCargandoCuestionario] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState("");
  // Aviso en el buscador: cliente tomado por otro encuestador, o resultado de
  // llamada registrado en Twenty.
  const [aviso, setAviso] = useState(null);
  const [gestion, setGestion] = useState({ abierta: false, resultado: "", proxima: "", observacion: "", enviando: false, error: "" });
  const [twentyCaido, setTwentyCaido] = useState(false);
  // Mes de gestión activo (lo decide el servidor, ver lib/gestion.js): el único
  // cuyos clientes se buscan y se pueden encuestar.
  const [mesesPermitidos, setMesesPermitidos] = useState([]);
  const [cliente, setCliente] = useState(null);
  // Id del cliente abierto, para descartar respuestas de un refresco que llegue
  // cuando el encuestador ya cambió de cliente.
  const clienteAbiertoRef = useRef(null);
  const [respuestas, setRespuestas] = useState({});
  const [indice, setIndice] = useState(0);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [erroresValidacion, setErroresValidacion] = useState([]);

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [resultadoFinal, setResultadoFinal] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [mostrarGuion, setMostrarGuion] = useState(true);

  function sesionExpirada() {
    router.replace("/login?next=/encuesta");
  }

  useEffect(() => {
    fetchSesion("/api/encuestadores", undefined, sesionExpirada)
      .then((r) => r.json())
      .then((d) => {
        const activos = (d.encuestadores || []).filter((e) => e.activo);
        setEncuestadores(activos);
        // Recordar al encuestador del dispositivo: no tiene que elegirse en cada recarga.
        const recordado = leerEncuestadorRecordado();
        if (recordado && activos.some((e) => e.id === recordado)) {
          setEncuestadorId(recordado);
          setStep((prev) => (prev === "encuestador" ? "cliente" : prev));
        }
      })
      .catch((err) => {
        if (err.message !== "Sesión expirada") setErrorCarga("No se pudo cargar la lista de encuestadores.");
      });
    fetchSesion("/api/clientes/meses", undefined, sesionExpirada)
      .then((r) => r.json())
      .then((d) => d.mesActivo && setMesesPermitidos([d.mesActivo]))
      .catch(() => {});
    fetchSesion("/api/cuestionarios/activo", undefined, sesionExpirada)
      .then((r) => r.json())
      .then((d) => setCuestionario(d.preguntas ? d : null))
      .catch((err) => {
        if (err.message !== "Sesión expirada") setErrorCarga("No se pudo cargar el cuestionario. Revisa tu conexión y recarga.");
      })
      .finally(() => setCargandoCuestionario(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResultados([]);
      setErrorBusqueda("");
      return;
    }
    setBuscando(true);
    // Cancela búsquedas anteriores: sin esto una respuesta lenta de una búsqueda
    // vieja podía pisar los resultados de lo último que se tecleó.
    const controller = new AbortController();
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim() });
      fetchSesion(`/api/clientes/search?${params.toString()}`, { signal: controller.signal }, sesionExpirada)
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Error en la búsqueda");
          setResultados(d.results || []);
          if (Array.isArray(d.mesesPermitidos) && d.mesesPermitidos.length) setMesesPermitidos(d.mesesPermitidos);
          setTwentyCaido(d.twentyDisponible === false ? d.twentyMotivo || "error" : false);
          setErrorBusqueda("");
        })
        .catch((err) => {
          if (err.name === "AbortError" || err.message === "Sesión expirada") return;
          setResultados([]);
          setErrorBusqueda("No se pudo buscar. Revisa tu conexión e intenta de nuevo.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setBuscando(false);
        });
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Cargar borradores cuando cambia el encuestador
  useEffect(() => {
    if (encuestadorId) {
      const list = getBorradoresFromStorage();
      setBorradores(list.filter((b) => b.encuestadorId === encuestadorId));
    } else {
      setBorradores([]);
    }
  }, [encuestadorId, step]);

  // Auto-guardar borrador al cambiar respuestas o índice
  useEffect(() => {
    if (step === "cuestionario" && activeDraftId && cliente && cuestionario) {
      saveBorradorToStorage({
        id: activeDraftId,
        encuestadorId,
        cuestionarioId: cuestionario.id,
        cliente,
        respuestas,
        indice,
      });
    }
  }, [respuestas, indice, step, activeDraftId, cliente, cuestionario, encuestadorId]);

  // Mientras la encuesta está abierta, el cliente sigue reservado para este
  // encuestador (el bloqueo vence a los 20 min sin renovar). Al cerrar la página se
  // suelta, para que otro pueda tomarlo; al volver al borrador se toma de nuevo.
  useEffect(() => {
    const id = cliente?.id_twenty;
    if (step !== "cuestionario" || !id || !encuestadorId) return;
    const renovar = setInterval(async () => {
      const r = await bloqueo(id, "tomar");
      if (r.status === 409) setAviso({ tipo: "error", texto: r.error });
    }, 4 * 60 * 1000);
    const alSalir = () => {
      const datos = new Blob([JSON.stringify({ encuestador_id: encuestadorId, accion: "liberar" })], { type: "application/json" });
      navigator.sendBeacon?.(`/api/clientes/${id}/bloqueo`, datos);
    };
    window.addEventListener("pagehide", alSalir);
    return () => {
      clearInterval(renovar);
      window.removeEventListener("pagehide", alSalir);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cliente?.id_twenty, encuestadorId]);

  const preguntaActual = cuestionario?.preguntas?.[indice];

  const autoRespuestas = useMemo(
    () => (cuestionario ? evaluarAutoRespuestas(cuestionario.preguntas, cliente) : {}),
    [cuestionario, cliente]
  );

  function elegirEncuestador(id) {
    setEncuestadorId(id);
    recordarEncuestador(id);
    const list = getBorradoresFromStorage();
    setBorradores(list.filter((b) => b.encuestadorId === id));
    setStep("cliente");
  }

  function cambiarEncuestador() {
    recordarEncuestador("");
    setEncuestadorId("");
    setStep("encuestador");
  }

  // Trae los datos vigentes del cliente (Twenty en ese momento, o la copia local)
  // y reajusta las preguntas que dependen de ellos: si el TOTAL apareció después
  // de la búsqueda o del borrador, la pregunta de corte y laminado vuelve a quedar
  // habilitada en vez de seguir omitida.
  async function refrescarCliente(id) {
    clienteAbiertoRef.current = id;
    try {
      const res = await fetchSesion(`/api/clientes/${id}`, {}, sesionExpirada);
      if (!res.ok) return;
      const { cliente: vigente } = await res.json();
      if (!vigente || clienteAbiertoRef.current !== id) return;
      setCliente((actual) => (actual?.id_twenty === id ? { ...actual, ...vigente } : actual));
      setRespuestas((prev) => reconciliarAutoRespuestas(cuestionario?.preguntas, vigente, prev));
    } catch {
      // Sin conexión o sesión expirada: se sigue con los datos que ya había.
    }
  }

  // Reserva el cliente para este encuestador mientras tiene abierta su encuesta
  // (en Twenty pasa a EN_GESTION) o lo suelta. → { ok, status, error }
  async function bloqueo(id, accion) {
    try {
      const res = await fetchSesion(
        `/api/clientes/${id}/bloqueo`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ encuestador_id: encuestadorId, accion }) },
        sesionExpirada
      );
      const d = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, error: d.error };
    } catch {
      // Sin conexión: se deja seguir; el servidor vuelve a validar al enviar.
      return { ok: true, status: 0 };
    }
  }

  function liberarClienteAbierto() {
    if (cliente?.id_twenty && encuestadorId) bloqueo(cliente.id_twenty, "liberar");
  }

  const bloqueadoPorOtro = (r) => Boolean(r.bloqueado_por_id && r.bloqueado_por_id !== encuestadorId);

  async function elegirCliente(c) {
    setAviso(null);
    const r = await bloqueo(c.id_twenty, "tomar");
    if (r.status === 409) {
      setAviso({ tipo: "error", texto: r.error });
      return;
    }
    abrirCliente(c);
  }

  function abrirCliente(c) {
    setGestion({ abierta: false, resultado: "", proxima: "", observacion: "", enviando: false, error: "" });
    setCliente(c);
    refrescarCliente(c.id_twenty);
    const auto = evaluarAutoRespuestas(cuestionario?.preguntas, c);
    const iniciales = { ...auto };
    setRespuestas(iniciales);
    setIndice(0);
    const newDraftId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setActiveDraftId(newDraftId);
    setErroresValidacion([]);
    setErrorEnvio(null);
    setStep("cuestionario");

    saveBorradorToStorage({
      id: newDraftId,
      encuestadorId,
      cuestionarioId: cuestionario?.id,
      cliente: c,
      respuestas: iniciales,
      indice: 0,
    });
  }

  async function continuarBorrador(b) {
    setAviso(null);
    if (b.cliente?.id_twenty) {
      const r = await bloqueo(b.cliente.id_twenty, "tomar");
      if (r.status === 409) {
        setAviso({ tipo: "error", texto: r.error });
        return;
      }
    }
    setGestion({ abierta: false, resultado: "", proxima: "", observacion: "", enviando: false, error: "" });
    setCliente(b.cliente);
    // El borrador guarda la foto del cliente de cuando se abrió: se reajusta ya
    // con esa foto y luego con los datos vigentes.
    setRespuestas(reconciliarAutoRespuestas(cuestionario?.preguntas, b.cliente, b.respuestas || {}));
    if (b.cliente?.id_twenty) refrescarCliente(b.cliente.id_twenty);
    setIndice(Math.min(b.indice || 0, Math.max(0, (cuestionario?.preguntas?.length || 1) - 1)));
    setActiveDraftId(b.id);
    setErroresValidacion([]);
    setErrorEnvio(null);
    setStep("cuestionario");
  }

  function eliminarBorradorHandler(e, bId) {
    e.stopPropagation();
    if (!window.confirm("¿Descartar este borrador? Se perderán las respuestas guardadas.")) return;
    deleteBorradorFromStorage(bId);
    setBorradores((prev) => prev.filter((b) => b.id !== bId));
  }

  function descartarBorradorActivo() {
    if (activeDraftId) deleteBorradorFromStorage(activeDraftId);
    nuevaEncuesta();
  }

  function actualizarRespuesta(preguntaId, nuevoValor) {
    setRespuestas((prev) => ({
      ...prev,
      [preguntaId]: nuevoValor,
    }));
    setErroresValidacion((prev) => prev.filter((e) => e.preguntaId !== preguntaId));
  }

  function manejarSubmit() {
    if (!cuestionario || !cliente || enviando) return;
    const envio = prepararEnvio(cuestionario.preguntas, respuestas, cliente);

    if (!envio.valido) {
      setErroresValidacion(envio.errores);
      return;
    }

    setErroresValidacion([]);
    enviar(envio);
  }

  async function enviar(envio) {
    setEnviando(true);
    setErrorEnvio(null);

    try {
      const res = await fetch("/api/encuestas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuestionario_id: cuestionario.id,
          cliente_twenty_id: cliente.id_twenty,
          encuestador_id: encuestadorId,
          // El id del borrador identifica este envío: si se reintenta (doble clic,
          // corte de red), el servidor devuelve la misma encuesta sin duplicarla.
          idempotency_key: activeDraftId,
          respuestas: envio.respuestas,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // El borrador NO se borra: el trabajo del encuestador se conserva para reintentar.
        if (res.status === 401) {
          setErrorEnvio({
            tipo: "sesion",
            mensaje: "Tu sesión expiró. Vuelve a iniciar sesión: el borrador quedó guardado en este dispositivo.",
          });
        } else if (data.code === "YA_ENCUESTADO" || data.code === "MES_NO_PERMITIDO") {
          setErrorEnvio({ tipo: "duplicado", mensaje: data.error });
        } else if (data.code === "RESPUESTAS_INVALIDAS") {
          // P. ej. la pregunta de corte y laminado quedó omitida con datos viejos del
          // cliente: se traen los vigentes (la reactiva) y se dice qué falta.
          refrescarCliente(cliente.id_twenty);
          const faltan = (data.errores || []).map((e) => e.mensaje).join(" ");
          setErrorEnvio({ tipo: "revisar", mensaje: faltan || data.error });
        } else if (data.code === "CUESTIONARIO_DESACTUALIZADO") {
          setErrorEnvio({ tipo: "recargar", mensaje: data.error });
        } else {
          setErrorEnvio({ tipo: "reintentar", mensaje: data.error || `Error del servidor (${res.status}).` });
        }
        return;
      }

      const completada = data.completada ?? envio.completada;
      setResultadoFinal({
        completada,
        id: data.id,
        status: data.status,
        twentyError: data.twentyError,
        duplicada: data.duplicada,
      });

      // Solo con confirmación del servidor se elimina el borrador local.
      if (activeDraftId) {
        deleteBorradorFromStorage(activeDraftId);
        setActiveDraftId(null);
      }
      setStep("fin");
    } catch {
      setErrorEnvio({
        tipo: "reintentar",
        mensaje: "No hubo conexión con el servidor. El borrador está guardado; vuelve a intentar el envío.",
      });
    } finally {
      setEnviando(false);
    }
  }

  async function registrarGestion() {
    if (!cliente || gestion.enviando) return;
    if (!gestion.resultado) return setGestion((g) => ({ ...g, error: "Elige el resultado de la llamada." }));
    if (gestion.resultado === "VOLVER_A_LLAMAR" && !gestion.proxima) {
      return setGestion((g) => ({ ...g, error: "Indica cuándo volver a llamar." }));
    }
    setGestion((g) => ({ ...g, enviando: true, error: "" }));
    try {
      const res = await fetchSesion(
        `/api/clientes/${cliente.id_twenty}/gestion`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            encuestador_id: encuestadorId,
            resultado: gestion.resultado,
            proxima_llamada: gestion.proxima ? new Date(gestion.proxima).toISOString() : null,
            observacion: gestion.observacion,
          }),
        },
        sesionExpirada
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `Error del servidor (${res.status})`);
      const etiqueta = RESULTADOS_LLAMADA.find((r) => r.valor === gestion.resultado)?.etiqueta || gestion.resultado;
      const nombre = cliente.nombre;
      if (activeDraftId) deleteBorradorFromStorage(activeDraftId);
      nuevaEncuesta();
      setAviso({
        tipo: d.twentyError ? "error" : "ok",
        texto: d.twentyError
          ? `${nombre}: "${etiqueta}" guardado. Twenty no respondió; se reintentará solo.`
          : `✓ ${nombre}: "${etiqueta}" registrado en Twenty.`,
      });
    } catch (err) {
      if (err.message === "Sesión expirada") return;
      setGestion((g) => ({ ...g, enviando: false, error: err.message }));
    }
  }

  function nuevaEncuesta() {
    // Si el cliente quedó sin estado final (encuesta descartada o abandonada), vuelve
    // a su estado anterior y queda libre para otros. Tras un envío no hace nada.
    liberarClienteAbierto();
    clienteAbiertoRef.current = null;
    setStep("cliente");
    setCliente(null);
    setQuery("");
    setResultados([]);
    setRespuestas({});
    setIndice(0);
    setActiveDraftId(null);
    setErroresValidacion([]);
    setErrorEnvio(null);
    setResultadoFinal(null);
    setCopiado(false);
  }

  async function copiarEtiqueta() {
    const texto = cliente?.etiqueta || "";
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const area = document.createElement("textarea");
      area.value = texto;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  const corteInfoActual = useMemo(() => {
    if (!cuestionario) return { cortada: false };
    return evaluarCortePrematuro(cuestionario.preguntas, respuestas);
  }, [cuestionario, respuestas]);

  // El progreso solo cuenta las preguntas que realmente hay que hacer: las N/A
  // automáticas y las que quedan fuera por un corte no restan (antes nunca se
  // llegaba al 100% si el cliente no tenía servicio de corte).
  const progreso = useMemo(() => {
    if (!cuestionario) return 0;
    const aplicables = cuestionario.preguntas
      .slice(0, corteInfoActual.cortada ? corteInfoActual.indiceCorte : undefined)
      .filter((p) => autoRespuestas[p.id] !== NA);
    if (aplicables.length === 0) return 100;
    const respondidas = aplicables.filter((p) => respuestaCompleta(p, respuestas[p.id], cliente)).length;
    return Math.round((respondidas / aplicables.length) * 100);
  }, [respuestas, cuestionario, autoRespuestas, corteInfoActual]);

  const nombreEncuestador = encuestadores.find((e) => e.id === encuestadorId)?.nombre || "";
  const guionApertura = cuestionario
    ? armarGuion(cuestionario.guion_apertura, {
        encuestador: nombreEncuestador,
        sucursal: cliente?.pdv,
        fecha: formatFecha(cliente?.fecha_atencion),
      })
    : "";

  return (
    <div className="container">
      <h1 className="page-title">Encuesta de satisfacción</h1>
      <p className="page-subtitle">
        {cuestionario ? cuestionario.nombre : cargandoCuestionario ? "Cargando cuestionario…" : "No hay cuestionario activo"}
      </p>

      {step !== "fin" && <Stepper paso={step} />}

      {errorCarga && (
        <div className="validation-box" style={{ marginBottom: 16 }}>
          ⚠️ {errorCarga}
        </div>
      )}

      {step === "encuestador" && (
        <div className="card pad">
          <label className="field-label">¿Quién está levantando esta encuesta?</label>
          <div className="option-list">
            {encuestadores.length === 0 && (
              <div className="empty-state">No hay encuestadores activos registrados.</div>
            )}
            {encuestadores.map((e) => (
              <div key={e.id} className="option-item" onClick={() => elegirEncuestador(e.id)}>
                <div className="nombre">{e.nombre}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "cliente" && (
        <div>
          {borradores.length > 0 && (
            <div className="card pad" style={{ marginBottom: 20, borderColor: "#c7d2fe", background: "#f5f7ff" }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 16, color: "#3730a3" }}>
                📋 Borradores pendientes de {nombreEncuestador}
              </h3>
              <p style={{ margin: "0 0 14px", fontSize: 13, color: "#4f46e5" }}>
                Tienes encuestas iniciadas que no se han finalizado. Puedes reanudarlas o iniciar una nueva.
              </p>
              <div className="drafts-list">
                {borradores.map((b) => (
                  <div key={b.id} className="draft-item" onClick={() => continuarBorrador(b)}>
                    <div className="draft-info">
                      <div className="draft-title">
                        {b.cliente?.nombre || "Cliente sin nombre"}
                        {cuestionario && b.cuestionarioId && b.cuestionarioId !== cuestionario.id && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: "#b45309" }}>(cuestionario anterior)</span>
                        )}
                        {mesesPermitidos.length > 0 && b.cliente?.mes_gestion && !mesesPermitidos.includes(String(b.cliente.mes_gestion).trim().toUpperCase()) && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: "#b91c1c" }}>
                            (mes {b.cliente.mes_gestion} cerrado: ya no se puede enviar)
                          </span>
                        )}
                      </div>
                      <div className="draft-meta">
                        Código {b.cliente?.codigo_cliente || "—"} · {b.cliente?.pdv || "—"} ·{" "}
                        {b.updatedAt ? new Date(b.updatedAt).toLocaleString("es-EC") : "Reciente"}
                      </div>
                    </div>
                    <div className="draft-actions">
                      <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 13 }}>
                        Continuar
                      </button>
                      <button
                        className="btn"
                        style={{ padding: "6px 10px", fontSize: 13, color: "#dc2626", borderColor: "#fca5a5" }}
                        onClick={(e) => eliminarBorradorHandler(e, b.id)}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Iniciar nueva encuesta</h3>
              {nombreEncuestador && (
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  Encuestador: <strong>{nombreEncuestador}</strong>{" "}
                  <button type="button" className="btn" style={{ fontSize: 12, padding: "2px 8px", marginLeft: 4 }} onClick={cambiarEncuestador}>
                    Cambiar
                  </button>
                </span>
              )}
            </div>

            {aviso && (
              <div
                style={{
                  margin: "0 0 12px",
                  padding: "8px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  background: aviso.tipo === "ok" ? "#ecfdf5" : "#fef2f2",
                  color: aviso.tipo === "ok" ? "#065f46" : "#991b1b",
                  border: `1px solid ${aviso.tipo === "ok" ? "#a7f3d0" : "#fecaca"}`,
                }}
              >
                {aviso.texto}
              </div>
            )}
            <label className="field-label" style={{ marginTop: 4 }}>
              Buscar cliente por nombre, código o teléfono:
            </label>
            {mesesPermitidos.length > 0 && (
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>
                Se muestran solo clientes del mes de gestión <strong>{mesesPermitidos.join(" y ")}</strong>.
              </p>
            )}
            <input
              className="search-input"
              placeholder="Buscar cliente por nombre, código o teléfono (escribe al menos 3 caracteres)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {buscando && <div style={{ fontSize: 13, color: "#9ca3af", marginTop: 8 }}>Buscando…</div>}
            {errorBusqueda && !buscando && (
              <div style={{ fontSize: 13, color: "#b91c1c", marginTop: 8 }}>⚠️ {errorBusqueda}</div>
            )}
            {twentyCaido && !buscando && !errorBusqueda && (
              <div style={{ fontSize: 12.5, color: "#92400e", marginTop: 8 }}>
                {twentyCaido === "lento"
                  ? "Twenty CRM está lento y no respondió a tiempo"
                  : "No se pudo consultar Twenty CRM en este momento"}
                : los resultados vienen de la copia local, que se actualiza cada 10 minutos.
              </div>
            )}
            {resultados.length > 0 && (
              <div className="option-list" style={{ marginTop: 12 }}>
                {resultados.map((r) => {
                  const tieneCorte = tieneDatoCliente(r, "total");
                  return (
                    <div
                      key={r.id_twenty}
                      className="option-item"
                      style={bloqueadoPorOtro(r) ? { opacity: 0.55, cursor: "not-allowed" } : undefined}
                      onClick={() =>
                        bloqueadoPorOtro(r)
                          ? setAviso({ tipo: "error", texto: `${r.bloqueado_por} ya está gestionando a este cliente.` })
                          : elegirCliente(r)
                      }
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div className="nombre">{r.nombre}</div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {tieneCorte ? (
                            <span
                              className="badge"
                              style={{
                                background: "#ecfdf5",
                                color: "#065f46",
                                border: "1px solid #a7f3d0",
                                fontSize: 11,
                                padding: "2px 8px",
                              }}
                              title="El cliente registra servicio de corte y laminado en Twenty CRM"
                            >
                              ✂️ Corte: {r.total} · P7 activa
                            </span>
                          ) : (
                            <span
                              className="badge"
                              style={{
                                background: "#f1f5f9",
                                color: "#64748b",
                                border: "1px solid #e2e8f0",
                                fontSize: 11,
                                padding: "2px 8px",
                              }}
                              title="Sin servicio de corte registrado. La pregunta 7 se omitirá automáticamente."
                            >
                              Sin corte · P7 N/A
                            </span>
                          )}
                          {bloqueadoPorOtro(r) ? (
                            <span
                              className="badge"
                              style={{ fontSize: 11, padding: "2px 8px", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}
                            >
                              🔒 En gestión por {r.bloqueado_por}
                              {r.bloqueado_desde ? ` · desde ${new Date(r.bloqueado_desde).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })}` : ""}
                            </span>
                          ) : r.status === "EFECTIVA" ? (
                            // En el buscador solo aparecen clientes SIN encuesta en la app: un
                            // EFECTIVA aquí se marcó a mano en Twenty y falta registrar la encuesta.
                            <span
                              className="badge"
                              style={{ fontSize: 11, padding: "2px 8px", background: "#fffbeb", color: "#92400e", border: "1px solid #fcd34d" }}
                              title="Marcado EFECTIVA en Twenty, pero la encuesta todavía no está registrada en el sistema."
                            >
                              EFECTIVA en Twenty · falta registrar
                            </span>
                          ) : r.status ? (
                            <span className="badge badge-mode-incremental" style={{ fontSize: 11, padding: "2px 8px" }}>{r.status}</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="detalle" style={{ marginTop: 6, display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                        <span>Código: <strong>{r.codigo_cliente || "—"}</strong></span>
                        <span>·</span>
                        <span>PDV: {r.pdv || "—"}</span>
                        <span>·</span>
                        <span>Mes: <strong>{r.mes_gestion || "—"}</strong></span>
                        {r.telefono1 && (
                          <>
                            <span>·</span>
                            <span style={{ color: "#4f46e5", fontWeight: 600 }}>📞 {r.telefono1}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!buscando && !errorBusqueda && query.trim().length >= 3 && resultados.length === 0 && (
              <div className="empty-state">
                No se encontraron clientes que coincidan con la búsqueda.
              </div>
            )}
          </div>
        </div>
      )}

      {step === "cuestionario" && cuestionario && cliente && (
        <div className="card">
          <div className="client-summary">
            <div><span>Cliente</span>{cliente.nombre}</div>
            <div><span>Código</span>{cliente.codigo_cliente}</div>
            {cliente.telefono1 && <div><span>Teléfono</span>📞 {cliente.telefono1}</div>}
            <div><span>PDV</span>{cliente.pdv}</div>
            <div><span>Mes</span>{cliente.mes_gestion}</div>
            <div>
              <span>Servicio de corte</span>
              {tieneDatoCliente(cliente, "total") ? (
                <span style={{ color: "#059669", fontWeight: 700 }}>
                  ✂️ Sí ({cliente.total}) · P7 activa
                </span>
              ) : (
                <span style={{ color: "#6b7280", fontWeight: 600 }}>
                  Sin corte · P7 omitida (N/A)
                </span>
              )}
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button
                className="btn"
                style={{ fontSize: 12, padding: "4px 10px" }}
                onClick={() => {
                  liberarClienteAbierto();
                  setStep("cliente");
                }}
              >
                Cambiar cliente
              </button>
            </div>
          </div>

          {aviso?.tipo === "error" && (
            <div className="pad" style={{ paddingBottom: 0 }}>
              <div className="validation-box">⚠️ {aviso.texto}</div>
            </div>
          )}

          <div className="pad" style={{ borderBottom: "1px solid #f0f1f3", paddingTop: 10, paddingBottom: 10 }}>
            {!gestion.abierta ? (
              <button
                className="btn"
                style={{ fontSize: 13 }}
                onClick={() => setGestion((g) => ({ ...g, abierta: true }))}
              >
                📞 ¿No se pudo hacer la encuesta? Registrar resultado de la llamada
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  Resultado de la llamada (se guarda directo en Twenty)
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {RESULTADOS_LLAMADA.map((r) => (
                    <button
                      key={r.valor}
                      className={`btn${gestion.resultado === r.valor ? " btn-primary" : ""}`}
                      style={{ fontSize: 13 }}
                      onClick={() => setGestion((g) => ({ ...g, resultado: r.valor, error: "" }))}
                    >
                      {r.etiqueta}
                    </button>
                  ))}
                </div>
                {(gestion.resultado === "VOLVER_A_LLAMAR" || gestion.resultado === "NO_CONTESTA") && (
                  <label style={{ display: "block", fontSize: 13, marginBottom: 8 }}>
                    Próxima llamada{gestion.resultado === "NO_CONTESTA" ? " (opcional)" : ""}:{" "}
                    <input
                      type="datetime-local"
                      className="text-input"
                      style={{ width: "auto", display: "inline-block", padding: "4px 8px" }}
                      value={gestion.proxima}
                      onChange={(e) => setGestion((g) => ({ ...g, proxima: e.target.value }))}
                    />
                  </label>
                )}
                <textarea
                  className="text-input"
                  rows={2}
                  placeholder="Observación (opcional)"
                  value={gestion.observacion}
                  onChange={(e) => setGestion((g) => ({ ...g, observacion: e.target.value }))}
                  style={{ marginBottom: 8 }}
                />
                {gestion.error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 8 }}>{gestion.error}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-primary" disabled={gestion.enviando} onClick={registrarGestion}>
                    {gestion.enviando ? "Guardando…" : "Guardar resultado"}
                  </button>
                  <button
                    className="btn"
                    disabled={gestion.enviando}
                    onClick={() => setGestion({ abierta: false, resultado: "", proxima: "", observacion: "", enviando: false, error: "" })}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pad">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600 }}>
                Progreso general ({progreso}%)
              </div>
              {activeDraftId && (
                <span style={{ fontSize: 11.5, color: "#16a34a", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>💾</span> Borrador guardado localmente
                </span>
              )}
            </div>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progreso}%` }} />
            </div>

            {/* Selector directo de preguntas */}
            <div className="question-nav-bar">
              {cuestionario.preguntas.map((p, i) => {
                const esNA = autoRespuestas[p.id] === NA;
                const numLabel = p.numero_reporte ?? (i + 1);
                const esCompleta = esNA || respuestaCompleta(p, respuestas[p.id], cliente);

                return (
                  <button
                    key={p.id}
                    className={`question-pill${i === indice ? " active" : ""}${esNA ? " na" : esCompleta ? " done" : ""}`}
                    onClick={() => {
                      setIndice(i);
                      setErroresValidacion([]);
                    }}
                    title={
                      esNA
                        ? `Pregunta ${numLabel}: Omitida (N/A) - Cliente sin servicio de corte`
                        : `Pregunta ${numLabel}`
                    }
                  >
                    P{numLabel} {esNA && <span style={{ fontSize: 10, marginLeft: 2 }}>(N/A)</span>}
                  </button>
                );
              })}
            </div>

            {enviando && <div className="empty-state">Guardando respuesta…</div>}

            {/* Guión de llamada (disponible en cualquier pregunta con botón para ver/ocultar) */}
            {!enviando && guionApertura && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ fontSize: 12, padding: "3px 10px", background: "#f8fafc", borderColor: "#e2e8f0" }}
                    onClick={() => setMostrarGuion(!mostrarGuion)}
                  >
                    📖 {mostrarGuion ? "Ocultar guión de llamada" : "Ver guión de llamada (speech)"}
                  </button>
                </div>
                {mostrarGuion && (
                  <div className="script-box" style={{ margin: 0 }}>
                    <span className="script-label">Guion de apertura (léelo al cliente)</span>
                    {guionApertura}
                  </div>
                )}
              </div>
            )}

            {/* Banner si la encuesta se cortó por respuesta Negativa en filtro inicial */}
            {corteInfoActual.cortada && (
              <div className="script-box" style={{ background: "#fee2e2", borderColor: "#fca5a5", color: "#991b1b" }}>
                <span className="script-label" style={{ color: "#7f1d1d" }}>Aviso de finalización anticipada</span>
                El cliente respondió "No" en una de las preguntas de filtro. Al finalizar, la encuesta se guardará como <strong>CORTADA</strong>.
              </div>
            )}

            {/* Alerta de validación si al intentar finalizar faltan respuestas */}
            {erroresValidacion.length > 0 && (
              <div className="validation-box">
                <h4 style={{ margin: "0 0 6px", fontSize: 15, color: "#991b1b" }}>
                  ⚠️ No se puede finalizar la encuesta
                </h4>
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "#7f1d1d" }}>
                  Por favor completa las siguientes preguntas obligatorias antes de enviar:
                </p>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "#991b1b" }}>
                  {erroresValidacion.map((err) => (
                    <li
                      key={err.preguntaId}
                      style={{ cursor: "pointer", textDecoration: "underline", marginBottom: 4 }}
                      onClick={() => {
                        setIndice(err.indice);
                        setErroresValidacion([]);
                      }}
                    >
                      {err.mensaje}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!enviando && preguntaActual && (() => {
              const esNA = autoRespuestas[preguntaActual.id] === NA;
              const numReporte = preguntaActual.numero_reporte ?? (indice + 1);

              return (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 12, textTransform: "uppercase", color: "#6b7280", fontWeight: 700 }}>
                      Pregunta {numReporte} · Paso {indice + 1} de {cuestionario.preguntas.length}
                    </div>
                    {preguntaActual.condicion?.campo === "total" && (
                      <div>
                        {tieneDatoCliente(cliente, "total") ? (
                          <span className="badge" style={{ background: "#ecfdf5", color: "#065f46", border: "1px solid #a7f3d0", fontSize: 11 }}>
                            ✂️ Servicio de corte registrado: {cliente.total}
                          </span>
                        ) : (
                          <span className="badge" style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #cbd5e1", fontSize: 11 }}>
                            ℹ️ Sin servicio de corte registrado en CRM
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <p style={{ fontSize: 17, fontWeight: 500, marginBottom: 14 }}>
                    {preguntaActual.texto}
                  </p>

                  {esNA ? (
                    <div
                      className="card pad"
                      style={{
                        background: "#f8fafc",
                        border: "1px dashed #cbd5e1",
                        textAlign: "center",
                        padding: "24px 16px",
                        margin: "16px 0",
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 8 }}>✂️</div>
                      <h4 style={{ margin: "0 0 6px", color: "#334155", fontSize: 16 }}>
                        Pregunta omitida automáticamente (N/A)
                      </h4>
                      <p style={{ margin: "0 0 12px", color: "#64748b", fontSize: 14, maxWidth: 520, marginInline: "auto", lineHeight: 1.5 }}>
                        Esta pregunta sobre la calidad de piezas cortadas y laminadas solo aplica para clientes que registraron dicho servicio (columna <code>total</code> en Twenty CRM).
                      </p>
                      <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 6, background: "#e2e8f0", color: "#475569", fontSize: 13, fontWeight: 600 }}>
                        ✓ Registrada como N/A — No requiere respuesta del encuestador
                      </div>
                    </div>
                  ) : (
                    <>
                      {preguntaActual.tipo === "aceptacion_si_no" && (
                        <div className="choice-row">
                          <button
                            className={`btn-choice btn-choice-yes${respuestas[preguntaActual.id] === true ? " selected" : ""}`}
                            onClick={() => actualizarRespuesta(preguntaActual.id, true)}
                          >
                            Sí
                          </button>
                          <button
                            className={`btn-choice btn-choice-no${respuestas[preguntaActual.id] === false ? " selected" : ""}`}
                            onClick={() => actualizarRespuesta(preguntaActual.id, false)}
                          >
                            No
                          </button>
                        </div>
                      )}

                      {preguntaActual.tipo === "escala_1_10" && (() => {
                        const valObj = respuestas[preguntaActual.id];
                        const cal = typeof valObj === "object" ? valObj?.calificacion : valObj;
                        const just = typeof valObj === "object" ? (valObj?.justificacion ?? "") : "";
                        const etiquetas = obtenerEtiquetasEscala(preguntaActual.texto);

                        return (
                          <div>
                            <div className="scale-grid">
                              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                                const nps = n <= 6 ? "detractor" : n <= 8 ? "passive" : "promoter";
                                return (
                                  <button
                                    key={n}
                                    className={`scale-btn ${nps}${cal === n ? " selected" : ""}`}
                                    onClick={() =>
                                      actualizarRespuesta(
                                        preguntaActual.id,
                                        preguntaActual.requiere_justificacion
                                          ? { calificacion: n, justificacion: just }
                                          : { calificacion: n }
                                      )
                                    }
                                  >
                                    {n}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Leyendas explicativas para 1 y 10 */}
                            <div className="scale-labels">
                              <span className="scale-label-min">{etiquetas.min}</span>
                              <span className="scale-label-max">{etiquetas.max}</span>
                            </div>

                            {preguntaActual.requiere_justificacion && (
                              <div style={{ marginTop: 16 }}>
                                <label className="field-label">¿Por qué? (motivo de su calificación)</label>
                                <textarea
                                  value={just}
                                  onChange={(e) =>
                                    actualizarRespuesta(preguntaActual.id, {
                                      calificacion: cal ?? null,
                                      justificacion: e.target.value,
                                    })
                                  }
                                  placeholder="Escribe el motivo de la calificación…"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {preguntaActual.tipo === "texto_abierto" && (
                        <div>
                          <textarea
                            value={typeof respuestas[preguntaActual.id] === "string" ? respuestas[preguntaActual.id] : ""}
                            onChange={(e) => actualizarRespuesta(preguntaActual.id, e.target.value)}
                            placeholder="Escribe la respuesta…"
                          />
                        </div>
                      )}
                    </>
                  )}

                  {/* Botones de Navegación Flexible */}
                  <div className="nav-buttons-row">
                    <button
                      className="btn btn-secondary"
                      disabled={indice === 0}
                      onClick={() => {
                        setIndice((prev) => Math.max(0, prev - 1));
                        setErroresValidacion([]);
                      }}
                    >
                      ◀ Anterior
                    </button>

                    {indice < cuestionario.preguntas.length - 1 ? (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setIndice((prev) => Math.min(cuestionario.preguntas.length - 1, prev + 1));
                          setErroresValidacion([]);
                        }}
                      >
                        Siguiente ▶
                      </button>
                    ) : (
                      <div />
                    )}

                    <button
                      className="btn btn-primary"
                      style={{ marginLeft: "auto" }}
                      onClick={manejarSubmit}
                      disabled={enviando}
                    >
                      {enviando ? "Enviando…" : errorEnvio ? "Reintentar envío ✓" : "Finalizar y Enviar Encuesta ✓"}
                    </button>
                  </div>

                  {errorEnvio && (
                    <div className="validation-box" style={{ marginTop: 16 }}>
                      <h4 style={{ margin: "0 0 6px", fontSize: 15, color: "#991b1b" }}>
                        ⚠️ La encuesta no se guardó
                      </h4>
                      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#7f1d1d" }}>{errorEnvio.mensaje}</p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {errorEnvio.tipo === "sesion" && (
                          <button className="btn btn-primary" onClick={sesionExpirada}>Iniciar sesión</button>
                        )}
                        {errorEnvio.tipo === "recargar" && (
                          <button className="btn btn-primary" onClick={() => window.location.reload()}>Recargar página</button>
                        )}
                        {errorEnvio.tipo === "duplicado" && (
                          <button className="btn btn-primary" onClick={descartarBorradorActivo}>
                            Descartar borrador y buscar otro cliente
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {step === "fin" && resultadoFinal && (
        <div className="card pad" style={{ textAlign: "center" }}>
          <div className={`result-icon-circle ${resultadoFinal.completada ? "success" : "stopped"}`}>
            {resultadoFinal.completada ? "✓" : "✕"}
          </div>
          <h2 style={{ margin: "0 0 8px" }}>
            {resultadoFinal.completada ? "Encuesta completada" : "Encuesta cortada"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            {resultadoFinal.completada
              ? "Se guardó la respuesta y el estado del cliente quedó como EFECTIVA."
              : resultadoFinal.status === "NO_LLAMAR"
                ? "El cliente no aceptó participar: se guardó lo respondido y quedó marcado como NO_LLAMAR."
                : "El cliente no continuó (no era quien realizó la compra). Se guardó lo respondido."}
          </p>
          {cuestionario?.guion_cierre && (
            <div className="script-box" style={{ textAlign: "left" }}>
              <span className="script-label">Guion de cierre (léelo al cliente)</span>
              {cuestionario.guion_cierre}
            </div>
          )}

          {cliente?.etiqueta && (
            <div className="copy-box">
              <span className="script-label" style={{ color: "#3730a3" }}>Etiqueta del cliente (para pegar donde corresponda)</span>
              <div className="copy-box-value">{cliente.etiqueta}</div>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={copiarEtiqueta}>
                {copiado ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          )}

          {resultadoFinal.twentyError && (
            <p style={{ color: "#991b1b", fontSize: 13 }}>
              Aviso: Twenty CRM no respondió, el cambio de estado quedó en cola y se reintentará automáticamente. La encuesta sí quedó guardada.
            </p>
          )}
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={nuevaEncuesta}>
            Levantar otra encuesta
          </button>
        </div>
      )}
    </div>
  );
}
