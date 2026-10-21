import { appAlert } from "../components/ui/AppDialog";
import { navigationRef } from "../services/notificationNavigation";

export const PANTALLA_PLANES = "Planes";
const PANTALLA_RESPALDO = "Configuracion";
const TIPOS_SIN_PLANES = ["viajes_activos_destinatario"];

export function esErrorDeLimite(error) {
  return Boolean(error?.detalle?.tipoLimite);
}

export function irAPlanes() {
  if (!navigationRef.isReady()) return;
  const rutas = navigationRef.getRootState()?.routeNames ?? [];
  navigationRef.navigate(rutas.includes(PANTALLA_PLANES) ? PANTALLA_PLANES : PANTALLA_RESPALDO);
}

export function mostrarLimiteAlcanzado(
  error,
  { titulo = "Llegaste al límite de tu plan", ofrecerPlanes = true, antesDeIr } = {}
) {
  const conPlanes = ofrecerPlanes && !TIPOS_SIN_PLANES.includes(error?.detalle?.tipoLimite);
  appAlert(
    titulo,
    error?.message,
    conPlanes
      ? [
          { text: "Ahora no", style: "cancel" },
          {
            text: "Ver planes",
            onPress: () => {
              antesDeIr?.();
              irAPlanes();
            },
          },
        ]
      : undefined,
    { tipo: "warning" }
  );
}