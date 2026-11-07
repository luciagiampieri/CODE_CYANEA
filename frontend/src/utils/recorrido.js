import { formatDayMonth, parseYMD, toYMD } from "./dates";

// Recorrido del viaje (US A). Cada destino lleva `noches` y `nochesEnViaje` (las del
// traslado hacia el destino siguiente). Las fechas nunca se guardan: se calculan acá.

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MAX_NOMBRES_SIN_NOCHES = 3;

export const MODOS_RECORRIDO = {
  UNICO: "unico",
  POCAS_NOCHES: "pocasNoches",
  SIN_ARMAR: "sinArmar",
  ARMADO: "armado",
};

export function textoNoches(cantidad) {
  return `${cantidad} ${cantidad === 1 ? "noche" : "noches"}`;
}

export function sumarDias(isoDate, dias) {
  const fecha = parseYMD(isoDate);
  fecha.setDate(fecha.getDate() + dias);
  return toYMD(fecha);
}

function enViajeDe(destino) {
  return destino?.nochesEnViaje ?? 0;
}

function tieneNoches(destino) {
  return destino?.noches !== null && destino?.noches !== undefined;
}

export function calcularNochesViaje(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const dias = Math.round((parseYMD(endDate) - parseYMD(startDate)) / MS_POR_DIA);
  return Math.max(0, dias);
}

export function modoRecorrido(destinos, totalNoches) {
  if (destinos.length <= 1) return MODOS_RECORRIDO.UNICO;
  if (totalNoches < destinos.length) return MODOS_RECORRIDO.POCAS_NOCHES;
  if (!destinos.every(tieneNoches)) return MODOS_RECORRIDO.SIN_ARMAR;
  return MODOS_RECORRIDO.ARMADO;
}

// Llegada y salida de cada destino. Con noches en viaje, la llegada al siguiente
// se corre esos días; las noches libres quedan después del último destino.
export function calcularTramos(destinos, startDate) {
  if (!startDate) return [];
  let llegada = startDate;
  return destinos.map((destino) => {
    const salida = sumarDias(llegada, destino.noches ?? 0);
    const nochesEnViaje = enViajeDe(destino);
    const llegadaSiguiente = sumarDias(salida, nochesEnViaje);
    const tramo = { llegada, salida, nochesEnViaje, llegadaSiguiente };
    llegada = llegadaSiguiente;
    return tramo;
  });
}

// "2 → 4 dic"; si cruza de mes, "28 nov → 1 dic". Sin noches no hay rango que mostrar.
export function textoRangoTramo(tramo) {
  if (tramo.llegada === tramo.salida) return "Sin noches todavía";
  const mismoMes = tramo.llegada.slice(0, 7) === tramo.salida.slice(0, 7);
  const inicio = mismoMes ? parseYMD(tramo.llegada).getDate() : formatDayMonth(tramo.llegada);
  return `${inicio} → ${formatDayMonth(tramo.salida)}`;
}

export function textoTraslado(tramo) {
  if (tramo.nochesEnViaje === 0) return `Traslado el ${formatDayMonth(tramo.salida)}`;
  return `Llegan el ${formatDayMonth(tramo.llegadaSiguiente)}`;
}

export function textoPildoraTraslado(nochesEnViaje) {
  return nochesEnViaje === 0 ? "Mismo día" : textoNoches(nochesEnViaje);
}

// Provincia y país, sin repetir lo que ya dice el nombre del destino.
export function textoRegion(destino) {
  const nombre = String(destino.name ?? "").trim().toLowerCase();
  return [destino.provinceState, destino.country]
    .filter((parte) => parte && parte.trim().toLowerCase() !== nombre)
    .join(", ");
}

function listarNombres(nombres) {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

function mensajeEstado({ exceso, sinNoches, libres, enViaje, totalNoches }) {
  if (exceso > 0) {
    return {
      tono: "danger",
      mensaje: `Hay ${textoNoches(exceso)} de más. Sacá noches para poder seguir.`,
    };
  }
  if (sinNoches.length > 0) {
    if (libres > 0) {
      return {
        tono: "info",
        mensaje: `Indicá cuántas noches pasan en cada destino. Tenés ${textoNoches(libres)} para repartir.`,
      };
    }
    const verbo = sinNoches.length === 1 ? "tiene" : "tienen";
    return {
      tono: "info",
      mensaje: `${listarNombres(sinNoches.slice(0, MAX_NOMBRES_SIN_NOCHES))} todavía no ${verbo} noches. Sacale noches a otro destino para sumárselas.`,
    };
  }
  if (libres > 0) {
    const inicio = libres === 1 ? "Queda 1 noche" : `Quedan ${libres} noches`;
    return { tono: "warning", mensaje: `${inicio} sin destino. Podés seguir igual.` };
  }
  const detalle = enViaje > 0 ? ` (${textoNoches(enViaje)} en viaje)` : "";
  return { tono: "success", mensaje: `Las ${totalNoches} noches están repartidas${detalle}.` };
}

function segmentosBarra(destinos, libres) {
  const segmentos = [];
  destinos.forEach((destino, index) => {
    if (destino.noches > 0) {
      segmentos.push({ tipo: "destino", noches: destino.noches, indice: index });
    }
    if (enViajeDe(destino) > 0) {
      segmentos.push({ tipo: "enViaje", noches: enViajeDe(destino), indice: index });
    }
  });
  if (libres > 0) segmentos.push({ tipo: "libre", noches: libres, indice: destinos.length });
  return segmentos;
}

export function resumenRecorrido(destinos, totalNoches) {
  const modo = modoRecorrido(destinos, totalNoches);
  if (modo !== MODOS_RECORRIDO.ARMADO) {
    return { modo, puedeAvanzar: true, mostrarRepartir: false, libres: 0, exceso: 0, segmentos: [] };
  }

  const enDestinos = destinos.reduce((total, destino) => total + destino.noches, 0);
  const enViaje = destinos.reduce((total, destino) => total + enViajeDe(destino), 0);
  const diferencia = totalNoches - enDestinos - enViaje;
  const libres = Math.max(0, diferencia);
  const exceso = Math.max(0, -diferencia);
  const sinNoches = destinos.filter((destino) => destino.noches === 0).map((destino) => destino.name);
  const bloqueado = exceso > 0 || sinNoches.length > 0;

  return {
    modo,
    libres,
    exceso,
    enViaje,
    sinNoches,
    puedeAvanzar: !bloqueado,
    mostrarRepartir: bloqueado,
    segmentos: segmentosBarra(destinos, libres),
    ...mensajeEstado({ exceso, sinNoches, libres, enViaje, totalNoches }),
  };
}

// Aviso para la pestaña Datos cuando cambia la cantidad de noches y un recorrido armado
// deja de coincidir. Usa la misma cuenta que `resumenRecorrido`.
export function avisoCambioFechas(destinos, totalNoches, nochesOriginales) {
  if (totalNoches === nochesOriginales) return null;
  const { modo, libres, exceso } = resumenRecorrido(destinos, totalNoches);
  if (modo !== MODOS_RECORRIDO.ARMADO) return null;

  const inicio = `Ahora el viaje tiene ${textoNoches(totalNoches)}.`;
  if (exceso > 0) {
    return {
      tono: "danger",
      mensaje: `${inicio} Sacá ${textoNoches(exceso)} de tus destinos para poder guardar.`,
    };
  }
  if (libres > 0) {
    const resto = libres === 1 ? "Te queda 1 noche" : `Te quedan ${libres} noches`;
    return { tono: "warning", mensaje: `${inicio} ${resto} sin destino.` };
  }
  return null;
}

// Al tocar un contador de un recorrido sin armar, los demás destinos pasan a 0.
function armar(destinos) {
  return destinos.map((destino) => ({
    ...destino,
    noches: destino.noches ?? 0,
    nochesEnViaje: enViajeDe(destino),
  }));
}

export function cambiarNoches(destinos, index, delta) {
  return armar(destinos).map((destino, i) =>
    i === index ? { ...destino, noches: Math.max(0, destino.noches + delta) } : destino
  );
}

export function cambiarNochesEnViaje(destinos, index, delta) {
  return armar(destinos).map((destino, i) =>
    i === index ? { ...destino, nochesEnViaje: Math.max(0, destino.nochesEnViaje + delta) } : destino
  );
}

// Un destino nuevo arranca en 0 noches. En un recorrido sin armar sigue sin noches,
// para no armarlo sin querer.
export function agregarDestino(destinos, nuevo) {
  if (destinos.length === 0) return [{ ...nuevo, noches: null, nochesEnViaje: 0 }];
  if (destinos.length === 1) {
    return [
      { ...destinos[0], noches: 0, nochesEnViaje: 0 },
      { ...nuevo, noches: 0, nochesEnViaje: 0 },
    ];
  }
  const noches = destinos.every(tieneNoches) ? 0 : null;
  return [...destinos, { ...nuevo, noches, nochesEnViaje: 0 }];
}

// Quedan por posición: al quitar B en A-B-C se libera A-B y B-C pasa a ser A-C. Al
// quitar el primero se libera su traslado saliente y el último nunca conserva noches
// en viaje.
export function quitarDestino(destinos, index) {
  const quitado = destinos[index];
  const restantes = destinos
    .filter((_, i) => i !== index)
    .map((destino, i) =>
      i === index - 1 ? { ...destino, nochesEnViaje: enViajeDe(quitado) } : destino
    );

  if (restantes.length === 1) return [{ ...restantes[0], noches: null, nochesEnViaje: 0 }];
  return restantes.map((destino, i) =>
    i === restantes.length - 1 ? { ...destino, nochesEnViaje: 0 } : destino
  );
}

// Las noches viajan con el destino; las noches en viaje quedan entre las mismas tarjetas.
export function moverDestino(destinos, desde, hasta) {
  if (desde === hasta || hasta < 0 || hasta >= destinos.length) return destinos;
  const enViajePorPosicion = destinos.map(enViajeDe);
  const reordenados = [...destinos];
  const [movido] = reordenados.splice(desde, 1);
  reordenados.splice(hasta, 0, movido);
  return reordenados.map((destino, i) => ({ ...destino, nochesEnViaje: enViajePorPosicion[i] }));
}

export function repartirNoches(destinos, totalNoches) {
  const enViaje = destinos.reduce((total, destino) => total + enViajeDe(destino), 0);
  const disponibles = Math.max(0, totalNoches - enViaje);
  const base = Math.floor(disponibles / destinos.length);
  const sobrantes = disponibles % destinos.length;
  return destinos.map((destino, i) => ({ ...destino, noches: base + (i < sobrantes ? 1 : 0) }));
}

// Posición donde cae una tarjeta arrastrada `dy` píxeles desde `desde`.
export function indiceDeArrastre(posiciones, desde, dy) {
  const origen = posiciones[desde];
  if (!origen) return desde;
  const centro = origen.y + origen.height / 2 + dy;
  let destino = desde;
  posiciones.forEach((posicion, i) => {
    if (!posicion) return;
    if (i < desde && centro < posicion.y + posicion.height) destino = Math.min(destino, i);
    if (i > desde && centro > posicion.y) destino = Math.max(destino, i);
  });
  return destino;
}

// Solo un recorrido armado se guarda con valores. Mientras se edita, los valores
// siguen en el formulario aunque el modo cambie: se recuperan si vuelven a alcanzar
// las noches.
export function destinosParaGuardar(destinos, totalNoches) {
  const armado = modoRecorrido(destinos, totalNoches) === MODOS_RECORRIDO.ARMADO;
  return destinos.map((destino, i) => ({
    ...destino,
    noches: armado ? destino.noches : null,
    nochesEnViaje: armado && i < destinos.length - 1 ? enViajeDe(destino) : 0,
  }));
}
