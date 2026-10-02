/**
 * Helpers para mover el scroll de una pantalla hacia un elemento.
 */

/**
 * Hace scroll en `scroller` (ref actual de un ScrollView) para llevar `node`
 * (ref actual de una View) a la zona visible.
 *
 *  - align "center": centra el elemento en la pantalla. Si es más alto que la zona
 *    visible, lo deja pegado arriba (con `margin`).
 *  - align "top": deja el elemento cerca del borde superior.
 *
 * El `node` necesita `collapsable={false}` para poder medirse en Android.
 * Si falta alguna referencia no hace nada.
 */
export function centerInScroll(
  scroller,
  node,
  { align = "top", margin = 16, fallbackViewportHeight = 600 } = {}
) {
  if (!scroller || !node) return;

  const inner = scroller.getInnerViewRef?.() ?? scroller.getScrollableNode?.();
  if (!inner) return;

  // Damos un pequeño respiro de 50ms para que el teclado termine de redibujar la pantalla
  setTimeout(() => {
    node.measureLayout(
      inner,
      (_x, y, _width, height) => {
        const target = Math.max(0, y - margin);

        // Usamos un requestAnimationFrame para sincronizar con los fotogramas de la UI y evitar el brinco brusco
        requestAnimationFrame(() => {
          if (typeof scroller.scrollTo === "function") {
            scroller.scrollTo({ y: target, animated: true });
          } else if (typeof scroller.scrollToOffset === "function") {
            scroller.scrollToOffset({ offset: target, animated: true });
          }
        });
      },
      () => {}
    );
  }, 50);
}