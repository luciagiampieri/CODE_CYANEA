import { appAlert, despuesDeCerrarModales } from "../components/ui/AppDialog";
import { getSugerenciaDocumentoTarea } from "../services/api";

export async function ofrecerSubirDocumentoTarea({ tripId, tarea, puedeSubir = true, onSubir }) {
  if (!puedeSubir || !tarea || (tarea.Documentos?.length ?? 0) > 0) return false;
  let sugerencia;
  try {
    sugerencia = await getSugerenciaDocumentoTarea(tripId, tarea.IdChecklist);
  } catch {
    return false;
  }
  if (!sugerencia?.sugerir) return false;

  appAlert(
    sugerencia.titulo,
    sugerencia.mensaje,
    [
      { text: "Ahora no", style: "cancel" },
      {
        text: "Subir",
        // El formulario es otro Modal: se abre cuando terminó de cerrarse el diálogo.
        onPress: () => despuesDeCerrarModales(() => onSubir?.(sugerencia)),
      },
    ],
    { tipo: "info", icono: "file-arrow-up" }
  );
  return true;
}

// Datos que recibe el formulario de subida (DocumentsScreen `tarea`).
export function datosSubidaDesdeTarea(tarea, sugerencia = null) {
  const documentos = tarea.Documentos || [];
  const ultimo = documentos[documentos.length - 1];
  return {
    IdChecklist: tarea.IdChecklist,
    Nombre: tarea.Nombre,
    IdActividad: tarea.IdActividad ?? null,
    // La categoría sugerida o, al agregar otro, la del último documento de la tarea.
    IdCategoriaDocumento: sugerencia?.IdCategoriaDocumento ?? ultimo?.IdCategoriaDocumento ?? null,
    // Pública para las tareas del grupo, privada para las privadas.
    EsPublico: sugerencia?.EsPublico ?? !tarea.EsPrivada,
    // «Entradas – Museo del Prado»: solo para el primer documento de la tarea.
    NombreSugerido: documentos.length === 0 ? sugerencia?.NombreSugerido ?? null : null,
  };
}
