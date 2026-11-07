import { useEffect, useState } from "react";

import { fotoDeDestino } from "../utils/fotoDestino";

// Fotos de los destinos por nombre. Se piden de a una y aparecen a medida que llegan.
export default function useFotosDestinos(destinos = [], activo = true) {
  const [fotos, setFotos] = useState({});
  const clave = destinos.map((destino) => `${destino.name}|${destino.country}`).join(";");

  useEffect(() => {
    if (!activo) return undefined;
    let vigente = true;
    destinos.forEach(async (destino) => {
      const uri = await fotoDeDestino(destino);
      if (vigente && uri) setFotos((actuales) => ({ ...actuales, [destino.name]: uri }));
    });
    return () => {
      vigente = false;
    };
  }, [clave, activo]);

  return fotos;
}
