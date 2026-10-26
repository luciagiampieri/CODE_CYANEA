export function conCategoriaActual(categorias, actual, claveId) {
  const lista = Array.isArray(categorias) ? [...categorias] : [];
  const id = actual?.[claveId];
  if (!id || lista.some((categoria) => categoria[claveId] === id)) return lista;
  return [...lista, actual];
}
