import { useMemo, useRef, useState } from "react";
import { Animated, PanResponder } from "react-native";

export default function useArrastreDia({ anchoPaso, onInicio, onCambio, onSoltar }) {
  const desplazamiento = useRef(new Animated.Value(0)).current;
  const [arrastrando, setArrastrando] = useState(false);
  const [pasos, setPasos] = useState(0);
  const activo = useRef(false);
  const gestoTomado = useRef(false);
  const pasosRef = useRef(0);
  const ultimo = useRef({});
  ultimo.current = { anchoPaso, onInicio, onCambio, onSoltar };

  function calcularPasos(dx) {
    const ancho = ultimo.current.anchoPaso || 1;
    return Math.round(dx / ancho);
  }

  function terminar(dx, movio) {
    const resultado = movio ? calcularPasos(dx) : 0;
    activo.current = false;
    gestoTomado.current = false;
    pasosRef.current = 0;
    desplazamiento.setValue(0);
    setArrastrando(false);
    setPasos(0);
    ultimo.current.onSoltar?.(resultado, movio);
  }
  const terminarRef = useRef(terminar);
  terminarRef.current = terminar;

  const panResponder = useMemo(() => {
    const puedeTomar = () => activo.current;
    return PanResponder.create({
      onMoveShouldSetPanResponder: puedeTomar,
      onMoveShouldSetPanResponderCapture: puedeTomar,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        gestoTomado.current = true;
      },
      onPanResponderMove: (_, gesto) => {
        desplazamiento.setValue(gesto.dx);
        const nuevos = calcularPasos(gesto.dx);
        if (nuevos !== pasosRef.current) {
          pasosRef.current = nuevos;
          setPasos(nuevos);
          ultimo.current.onCambio?.(nuevos);
        }
      },
      onPanResponderRelease: (_, gesto) => terminarRef.current(gesto.dx, true),
      onPanResponderTerminate: (_, gesto) => terminarRef.current(gesto.dx, true),
    });
  }, [desplazamiento]);

  function alMantener() {
    activo.current = true;
    setArrastrando(true);
    ultimo.current.onInicio?.();
  }

  function alSoltar() {
    if (activo.current && !gestoTomado.current) terminar(0, false);
  }

  return {
    desplazamiento,
    arrastrando,
    pasos,
    panHandlers: panResponder.panHandlers,
    alMantener,
    alSoltar,
  };
}