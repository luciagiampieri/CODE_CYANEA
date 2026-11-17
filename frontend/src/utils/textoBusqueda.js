// Búsqueda de texto sin distinguir mayúsculas ni tildes ("museo" encuentra "Muséo").
// Única versión para buscadores y sugerencias: no copiarla en cada componente.

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizarCaracter(caracter) {
  return caracter.normalize("NFD").replace(MARCAS_DIACRITICAS, "").toLowerCase();
}

/** Texto en minúsculas, sin tildes y sin espacios alrededor. */
export function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(MARCAS_DIACRITICAS, "")
    .toLowerCase()
    .trim();
}

/** Si `texto` contiene `busqueda`, sin distinguir mayúsculas ni tildes. */
export function contieneTexto(texto, busqueda) {
  const buscado = normalizarTexto(busqueda);
  if (!buscado) return false;
  return normalizarTexto(texto).includes(buscado);
}

/**
 * Divide `texto` en partes marcando la primera coincidencia con `busqueda`:
 * [{ texto, resaltado }]. Se normaliza carácter por carácter para que las posiciones
 * coincidan con el texto original aunque tenga tildes.
 */
export function partesResaltadas(texto, busqueda) {
  const original = String(texto ?? "");
  const buscado = normalizarTexto(busqueda);
  if (!buscado || !original) return [{ texto: original, resaltado: false }];

  let normalizado = "";
  const posicionOriginal = []; // posición en el original de cada carácter normalizado
  let posicion = 0;
  for (const caracter of Array.from(original)) {
    const comoQueda = normalizarCaracter(caracter);
    for (let i = 0; i < comoQueda.length; i += 1) posicionOriginal.push(posicion);
    normalizado += comoQueda;
    posicion += caracter.length;
  }

  const desde = normalizado.indexOf(buscado);
  if (desde < 0) return [{ texto: original, resaltado: false }];
  const inicio = posicionOriginal[desde];
  const ultimo = posicionOriginal[desde + buscado.length - 1];
  const fin = ultimo + Array.from(original.slice(ultimo))[0].length;

  return [
    { texto: original.slice(0, inicio), resaltado: false },
    { texto: original.slice(inicio, fin), resaltado: true },
    { texto: original.slice(fin), resaltado: false },
  ].filter((parte) => parte.texto.length > 0);
}
