import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const EVENTOS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
const TREINTA_MINUTOS = 30 * 60 * 1000;

export function useInactividad(activo, alExpirar, milisegundos = TREINTA_MINUTOS) {
  const callback = useRef(alExpirar);

  useEffect(() => {
    callback.current = alExpirar;
  }, [alExpirar]);

  useEffect(() => {
    if (!activo || Platform.OS !== 'web' || typeof window === 'undefined') {
      return undefined;
    }

    let temporizador;
    const reiniciar = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => callback.current(), milisegundos);
    };

    EVENTOS.forEach((evento) => window.addEventListener(evento, reiniciar, { passive: true }));
    reiniciar();

    return () => {
      clearTimeout(temporizador);
      EVENTOS.forEach((evento) => window.removeEventListener(evento, reiniciar));
    };
  }, [activo, milisegundos]);
}