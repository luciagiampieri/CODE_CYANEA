
export function minutosDesdeMedianoche(hora) {
    if (!hora) return null;
    const [horas, minutos] = hora.split(":").map(Number);
    if (Number.isNaN(horas) || Number.isNaN(minutos)) return null;
    return horas * 60 + minutos;
}


export function calcularActividadesSolapadas(actividades = []) {
    const solapadas = new Set();

    const normalizadas = actividades
        .map((actividad) => ({
            id: actividad.id,
            inicio: minutosDesdeMedianoche(actividad.horaInicio),
            fin: minutosDesdeMedianoche(actividad.horaFin),
        }))
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