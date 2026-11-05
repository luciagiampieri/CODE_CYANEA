import { useCallback, useEffect, useState } from "react";

const DURACION_AVISO_MS = 5000;

// Aviso para deshacer la baja de un destino. Guarda la lista completa anterior:
// quitar también mueve noches en viaje de los destinos vecinos. Cualquier otro
// cambio en los destinos cierra el aviso, así deshacer nunca pisa algo posterior.
export default function useDeshacerDestino(destinos, onRestaurar) {
  const [aviso, setAviso] = useState(null);

  const descartar = useCallback(() => setAviso(null), []);

  const avisarQuitado = useCallback((nombre, anterior, resultante) => {
    setAviso({ nombre, anterior, resultante });
  }, []);

  function deshacer() {
    if (!aviso) return;
    onRestaurar(aviso.anterior);
    setAviso(null);
  }

  useEffect(() => {
    if (aviso && destinos !== aviso.resultante) setAviso(null);
  }, [aviso, destinos]);

  useEffect(() => {
    if (!aviso) return undefined;
    const temporizador = setTimeout(() => setAviso(null), DURACION_AVISO_MS);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  return { aviso, avisarQuitado, deshacer, descartar };
}
