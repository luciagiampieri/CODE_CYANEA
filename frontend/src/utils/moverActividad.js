const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function hoyISO(ahora = new Date()) {
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

function fechaISO(fechaRaw) {
  return String(fechaRaw ?? "").slice(0, 10);
}

export function etiquetaDia(fechaRaw) {
  const fecha = new Date(`${fechaISO(fechaRaw)}T12:00:00`);
  if (Number.isNaN(fecha.getTime())) return "";
  return `${DIAS_SEMANA[fecha.getDay()]} ${fecha.getDate()}`;
}

export function diaDisponibleParaMover(dia, hoy = hoyISO()) {
  return Boolean(dia) && Number.isInteger(dia.dayId) && fechaISO(dia.fechaRaw) >= hoy;
}

export function diasParaMover(dias = [], diaActualId = null, hoy = hoyISO()) {
  return dias.filter((dia) => dia.dayId === diaActualId || diaDisponibleParaMover(dia, hoy));
}

export function diaDestinoDeArrastre(dias = [], diaOrigenId, pasos, hoy = hoyISO()) {
  if (!pasos) return null;
  const indice = dias.findIndex((dia) => dia.dayId === diaOrigenId);
  if (indice < 0) return null;
  const destino = dias[indice + pasos];
  return diaDisponibleParaMover(destino, hoy) ? destino : null;
}

export function etiquetaArrastre(dias, diaOrigenId, pasos, hoy = hoyISO()) {
  if (!pasos) return { texto: "Deslizá hacia un costado", valido: false };
  const destino = diaDestinoDeArrastre(dias, diaOrigenId, pasos, hoy);
  return destino
    ? { texto: `Mover al ${etiquetaDia(destino.fechaRaw)}`, valido: true }
    : { texto: "Ese día no está disponible", valido: false };
}

export function confirmacionDeMovimiento(resultado) {
  const advertencia = resultado?.advertencia;
  return {
    confirmarSuperposicion: true,
    ...(advertencia?.tipo && advertencia?.resumen
      ? { advertenciaHorario: { tipo: advertencia.tipo, resumen: advertencia.resumen } }
      : {}),
  };
}