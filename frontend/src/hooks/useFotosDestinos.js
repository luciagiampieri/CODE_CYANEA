import { useEffect, useState } from "react";

import { fotoDeDestino } from "../utils/fotoDestino";


const cache = new Map();

const MAX_SIMULTANEOS = 2;
let enCurso = 0;
const cola = [];

function siguiente() {
  if (enCurso >= MAX_SIMULTANEOS || cola.length === 0) return;
  const { tarea, resolver } = cola.shift();
  enCurso += 1;
  tarea()
    .then(resolver, () => resolver(null))
    .finally(() => {
      enCurso -= 1;
      siguiente();
    });
}

function encolar(tarea) {
  return new Promise((resolver) => {
    cola.push({ tarea, resolver });
    siguiente();
  });
}

function claveDe(destino) {
  return `${destino?.name ?? ""}|${destino?.country ?? ""}`;
}

function fotoCacheada(destino) {
  const clave = claveDe(destino);
  if (!cache.has(clave)) {
    const pedido = encolar(() => fotoDeDestino(destino)).then((uri) => {
      if (!uri) cache.delete(clave);
      return uri ?? null;
    });
    cache.set(clave, pedido);
  }
  return cache.get(clave);
}

export function limpiarCacheFotosDestinos() {
  cache.clear();
  cola.length = 0;
  enCurso = 0;
}

export default function useFotosDestinos(destinos = [], activo = true) {
  const [fotos, setFotos] = useState({});
  const clave = destinos.map(claveDe).join(";");

  useEffect(() => {
    if (!activo) return undefined;
    let vigente = true;
    destinos.forEach((destino) => {
      fotoCacheada(destino).then((uri) => {
        if (vigente && uri) {
          setFotos((actuales) =>
            actuales[destino.name] === uri ? actuales : { ...actuales, [destino.name]: uri }
          );
        }
      });
    });
    return () => {
      vigente = false;
    };
  }, [clave, activo]);

  return fotos;
}