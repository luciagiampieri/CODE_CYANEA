import { activarModoTeclado } from "../../utils/tecladoExperimental";

/**
 * Activa la técnica B del teclado de la web (como hace App.js con ?teclado=ab) con una
 * ventana y un documento de mentira. Devuelve la función que la apaga. Para que
 * tecladoUnificado() sea true, además Platform.OS tiene que ser "web".
 */
export function activarTecladoUnificado() {
  const win = {
    location: { search: "?teclado=ab" },
    sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  };
  const doc = { addEventListener: () => {}, removeEventListener: () => {}, body: null };
  return activarModoTeclado(win, doc).desinstalar;
}
