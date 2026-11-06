
export function minutosDesdeMedianoche(hora) {
    if (!hora) return null;
    const [horas, minutos] = hora.split(":").map(Number);
    if (Number.isNaN(horas) || Number.isNaN(minutos)) return null;
    return horas * 60 + minutos;
}


const MINUTOS_DEL_DIA = 24 * 60;

export function calcularActividadesSolapadas(actividades = []) {
    const solapadas = new Set();

    const normalizadas = actividades
        .map((actividad) => {
            const inicio = minutosDesdeMedianoche(actividad.horaInicio);
            const fin = minutosDesdeMedianoche(actividad.horaFin);
            // Un traslado que llega otro día ocupa hasta el final del día de salida.
            const llegaOtroDia = Boolean(actividad.traslado) && fin !== null && fin < inicio;
            return { id: actividad.id, inicio, fin: llegaOtroDia ? MINUTOS_DEL_DIA : fin };
        })
        .filter((actividad) => actividad.inicio !== null && actividad.fin !== null);

    for (let i = 0; i < normalizadas.length; i += 1) {
        for (let j = i + 1; j < normalizadas.length; j += 1) {
            const a = normalizadas[i];
            const b = normalizadas[j];
            const seSolapan = a.inicio < b.fin && b.inicio < a.fin;

            if (seSolapan) {
                solapadas.add(a.id);
                solapadas.add(b.id);
            }
        }
    }

    return solapadas;
}