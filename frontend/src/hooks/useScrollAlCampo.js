import { useCallback, useRef } from "react";
import { Platform } from "react-native";

/**
 * Mantiene visible el campo que se está editando moviendo el scroll SOLO lo necesario:
 * - Si el campo ya se ve completo sobre el teclado, no se mueve nada.
 * - Si queda tapado, se desplaza justo lo suficiente para que quede apenas por encima del teclado.
 * Usa la altura real visible del ScrollView (que ya descuenta el teclado), por eso se adapta
 * a cualquier dispositivo y tamaño de teclado.
 *
 * Uso: `ref` y `...scrollProps` en el ScrollView; `onLayout={registrar("campo")}` en la View
 * del campo y `onFocus={() => enfocar("campo")}` en su TextInput.
 *
 * - `registrar(key)` mide el campo respecto del contenido del ScrollView. Si el campo está
 *   dentro de otras Views, se registran con `registrarContenedor(clave, padre)` y el campo con
 *   `registrar(key, clave)`: la posición suma la cadena de contenedores.
 * - `registrarBase` es el contenedor "base", el que usan los campos registrados sin contenedor
 *   (si nadie lo registra vale 0).
 * - `registrarNodo(key)` devuelve un `ref` para la View del campo: con él la posición se mide
 *   al enfocar (`measureLayout`) en lugar de usar la de `onLayout`. Hace falta cuando lo que
 *   está arriba del campo cambia después de montarse (en la web `onLayout` solo avisa cuando el
 *   campo cambia de tamaño, no cuando se mueve). Si la medición falla, se usa la de `onLayout`.
 * - `soloWeb: true` (opción del hook): fuera de la web el hook no hace nada y no agrega props.
 *   `enfocar(key, { soloWeb: true })` hace lo mismo para un solo campo.
 *
 * No confundir con `useScrollACampo`, que en las hojas de actividad y traslado lleva el campo
 * a 80 px del borde superior siempre.
 */
export default function useScrollAlCampo({ margen = 20, soloWeb = false } = {}) {
  const ref = useRef(null);
  const scrollY = useRef(0);
  const alturaVisible = useRef(0);
  const campos = useRef({});
  const contenedores = useRef({});
  const nodos = useRef({});
  const refsDeNodos = useRef({});
  const activo = useRef(null);
  const inerte = soloWeb && Platform.OS !== "web";

  // Posición de un contenedor respecto del contenido del ScrollView.
  const desplazamiento = useCallback((clave) => {
    let total = 0;
    let actual = clave;
    const vistos = new Set();
    while (actual != null && !vistos.has(actual)) {
      vistos.add(actual);
      const contenedor = contenedores.current[actual];
      if (!contenedor) break;
      total += contenedor.y;
      actual = contenedor.padre;
    }
    return total;
  }, []);

  // Mueve el scroll lo justo para que el campo (arriba/alto en el contenido) quede visible.
  const desplazarHasta = useCallback(
    (arriba, alto) => {
      if (!alturaVisible.current) return;
      const abajo = arriba + alto;
      const visibleArriba = scrollY.current;
      const visibleAbajo = scrollY.current + alturaVisible.current;

      let destino = null;
      if (abajo + margen > visibleAbajo) {
        destino = abajo + margen - alturaVisible.current;
      } else if (arriba - margen < visibleArriba) {
        destino = arriba - margen;
      }
      if (destino !== null) {
        ref.current?.scrollTo?.({ y: Math.max(0, destino), animated: true });
      }
    },
    [margen]
  );

  const asegurarVisible = useCallback(() => {
    const key = activo.current;
    if (key == null || !alturaVisible.current) return;
    const campo = campos.current[key];
    const desdeOnLayout = () => {
      if (campo) desplazarHasta(desplazamiento(campo.contenedor) + campo.y, campo.h);
    };

    // Con nodo registrado se mide la posición real en este momento: en la web onLayout solo
    // avisa cuando el campo cambia de tamaño, no cuando se mueve porque cambió lo de arriba.
    const nodo = nodos.current[key];
    const scroller = ref.current;
    const contenido = scroller?.getInnerViewRef?.() ?? scroller?.getScrollableNode?.();
    if (!nodo || !contenido || typeof nodo.measureLayout !== "function") {
      desdeOnLayout();
      return;
    }
    try {
      nodo.measureLayout(contenido, (_x, y, _ancho, alto) => desplazarHasta(y, alto), desdeOnLayout);
    } catch {
      desdeOnLayout();
    }
  }, [desplazamiento, desplazarHasta]);

  const registrarContenedor = useCallback(
    (clave, padre = null) =>
      (e) => {
        contenedores.current[clave] = { y: e.nativeEvent.layout.y, padre };
      },
    []
  );

  const registrarBase = useCallback((e) => {
    contenedores.current.base = { y: e.nativeEvent.layout.y, padre: null };
  }, []);

  const registrar = useCallback(
    (key, contenedor = "base") =>
      (e) => {
        const { y, height } = e.nativeEvent.layout;
        campos.current[key] = { y, h: height, contenedor };
      },
    []
  );

  // Ref (estable por campo) para la View del campo: permite medir su posición real al enfocar.
  const registrarNodo = useCallback((key) => {
    if (!refsDeNodos.current[key]) {
      refsDeNodos.current[key] = (nodo) => {
        if (nodo) nodos.current[key] = nodo;
        else delete nodos.current[key];
      };
    }
    return refsDeNodos.current[key];
  }, []);

  const enfocar = useCallback(
    (key, opciones = {}) => {
      if (inerte || (opciones.soloWeb && Platform.OS !== "web")) return;
      activo.current = key;
      setTimeout(asegurarVisible, 120);
      setTimeout(asegurarVisible, 380);
    },
    [asegurarVisible, inerte]
  );

  const limpiar = useCallback(() => {
    activo.current = null;
  }, []);

  if (inerte) {
    const sinMedir = () => undefined;
    return {
      ref,
      scrollProps: {},
      registrar: sinMedir,
      registrarContenedor: sinMedir,
      registrarNodo: sinMedir,
      registrarBase: undefined,
      enfocar,
      limpiar,
    };
  }

  const scrollProps = {
    scrollEventThrottle: 16,
    onScroll: (e) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
    },
    onLayout: (e) => {
      alturaVisible.current = e.nativeEvent.layout.height;
      if (activo.current != null) setTimeout(asegurarVisible, 50);
    },
  };

  return {
    ref,
    scrollProps,
    registrar,
    registrarContenedor,
    registrarNodo,
    registrarBase,
    enfocar,
    limpiar,
  };
}
