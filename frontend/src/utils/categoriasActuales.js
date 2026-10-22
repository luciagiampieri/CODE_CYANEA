// Al editar un gasto, documento o tarea, el elemento conserva su categoría
// aunque se haya desactivado desde el backoffice (US 110). Como el backend solo
// devuelve las categorías activas, la actual se suma al selector.
export function conCategoriaActual(categorias, actual, claveId) {
  const lista = Array.isArray(categorias) ? [...categorias] : [];
  const id = actual?.[claveId];
  if (!id || lista.some((categoria) => categoria[claveId] === id)) return lista;
  return [...lista, actual];
}
