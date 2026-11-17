import { useRef } from "react";

import { tecladoUnificado } from "../utils/tecladoExperimental";

// Lleva un campo a la vista al enfocarlo, cuando el teclado achica la hoja. Cada campo
// guarda su posición en `fieldY` desde `onLayout`.
export default function useScrollACampo() {
  const scrollRef = useRef(null);
  const fieldY = useRef({});

  function scrollToField(key) {
    // En web, con la técnica B, el campo lo lleva a la vista mostrarCampoEnfocado (solo si
    // quedó tapado): acá no se desplaza para no sumar un segundo movimiento.
    if (tecladoUnificado()) return;
    setTimeout(() => {
      const y = fieldY.current[key];
      if (y == null) return;
      scrollRef.current?.scrollTo({ y: Math.max(y - 80, 0), animated: true });
    }, 300);
  }

  return { scrollRef, fieldY, scrollToField };
}
