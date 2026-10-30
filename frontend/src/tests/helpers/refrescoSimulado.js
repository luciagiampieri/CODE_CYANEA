// Busca el RefreshControl del ScrollView en el árbol renderizado
// (no depende de las consultas UNSAFE_ de testing-library).
export function controlDeRefresco(arbol) {
  let control = null;
  const recorrer = (nodo) => {
    if (!nodo || typeof nodo === 'string' || control) return;
    if (Array.isArray(nodo)) return nodo.forEach(recorrer);
    if (nodo.props?.refreshControl) {
      control = nodo.props.refreshControl;
      return;
    }
    (nodo.children || []).forEach(recorrer);
  };
  recorrer(arbol);
  return control;
}
