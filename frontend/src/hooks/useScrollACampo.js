import { useRef } from "react";

// Lleva un campo a la vista al enfocarlo, cuando el teclado achica la hoja. Cada campo
// guarda su posición en `fieldY` desde `onLayout`.
export default function useScrollACampo() {
  const scrollRef = useRef(null);
  const fieldY = useRef({});

  function scrollToField(key) {
    setTimeout(() => {
      const y = fieldY.current[key];
      if (y == null) return;
      scrollRef.current?.scrollTo({ y: Math.max(y - 80, 0), animated: true });
    }, 300);
  }

  return { scrollRef, fieldY, scrollToField };
}
