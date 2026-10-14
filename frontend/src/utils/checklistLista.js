/**
 * Agrega la tarea recién creada al principio de la lista sin duplicarla.
 *
 * Al crear una tarea el backend avisa por WebSocket ("checklist_actualizado") a
 * todos los integrantes, incluido quien la creó, y esa pantalla recarga la lista.
 * Si la recarga llega antes que el callback del formulario, la tarea ya está en
 * la lista: hay que reemplazarla, no agregarla de nuevo.
 */
export function agregarChecklistSinDuplicar(lista, checklist) {
  const resto = (lista || []).filter((c) => c.IdChecklist !== checklist.IdChecklist);
  return [checklist, ...resto];
}
