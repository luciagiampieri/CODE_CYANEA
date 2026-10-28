import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

function estaConectado(estado) {
  return Boolean(estado?.isConnected) && estado?.isInternetReachable !== false;
}

export default function useConexion(alReconectar) {
  const [conectado, setConectado] = useState(true);
  const anterior = useRef(true);
  const callbackRef = useRef(alReconectar);
  callbackRef.current = alReconectar;

  useEffect(() => {
    let activo = true;

    const aplicar = (estado) => {
      if (!activo || !estado) return;
      const ahora = estaConectado(estado);
      if (ahora && anterior.current === false) callbackRef.current?.();
      anterior.current = ahora;
      setConectado(ahora);
    };

    Promise.resolve(NetInfo.fetch?.()).then(aplicar).catch(() => {});
    const desuscribir = NetInfo.addEventListener?.(aplicar);

    return () => {
      activo = false;
      if (typeof desuscribir === "function") desuscribir();
    };
  }, []);

  return conectado;
}