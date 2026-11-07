"""Traslados del viaje (US 136).

Un traslado es una `ActividadItinerario` vinculada a un tramo del recorrido: la ida, un
par origen → destino o el regreso. Se identifica por el tramo y no por el día, así que
las fechas, el día donde se muestra y la validez se calculan siempre desde el recorrido
actual; nada de eso se persiste.
"""

from dataclasses import dataclass, replace
from datetime import date, time, timedelta
from typing import Sequence

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.actividad_itinerario import ActividadItinerario
from app.models.destino_viaje import DestinoViaje
from app.models.tramo_traslado_viaje import (
    TIPO_TRAMO_ENTRE_DESTINOS,
    TIPO_TRAMO_IDA,
    TIPO_TRAMO_REGRESO,
    TramoTrasladoViaje,
)
from app.models.viaje import Viaje
from app.schemas.traslado import TramoRef, TramoTrasladoRead, TrasladoActividadRead
from app.services.activity_ai.context import ULTIMO_MINUTO_DEL_DIA, minutos_de
from app.services.recorrido_viaje import calcular_tramos, recorrido_armado

TRANSFER_MEDIUM_REQUIRED = "TRANSFER_MEDIUM_REQUIRED"
TRANSFER_TIME_REQUIRED = "TRANSFER_TIME_REQUIRED"
TRANSFER_TIME_INVALID = "TRANSFER_TIME_INVALID"
TRANSFER_ALREADY_EXISTS = "TRANSFER_ALREADY_EXISTS"
TRANSFER_SEGMENT_NOT_AVAILABLE = "TRANSFER_SEGMENT_NOT_AVAILABLE"
TRANSFER_SEGMENT_REQUIRED = "TRANSFER_SEGMENT_REQUIRED"
TRANSFER_NOT_FOUND = "TRANSFER_NOT_FOUND"
TRANSFER_USE_TRANSFER_FORM = "TRANSFER_USE_TRANSFER_FORM"

VALIDO = "valido"
NO_CORRESPONDE = "no_corresponde"
SIN_FECHA = "sin_fecha"

PENDIENTE = "pendiente"
OCULTO = "oculto"
AGENDADO = "agendado"

# Ícono del medio -> cómo se nombra en el traslado.
NOMBRES_MEDIOS = {
    "plane": "Avión",
    "bus": "Micro",
    "car": "Auto",
    "train": "Tren",
    "ship": "Barco",
    "motorcycle": "Moto",
    "bicycle": "Bicicleta",
    "person-walking": "Caminando",
    "route": "Traslado",
}

CODIGOS_TIPOS = {
    TIPO_TRAMO_IDA: "ida",
    TIPO_TRAMO_ENTRE_DESTINOS: "entre_destinos",
    TIPO_TRAMO_REGRESO: "regreso",
}
TIPOS_POR_CODIGO = {codigo: tipo for tipo, codigo in CODIGOS_TIPOS.items()}

ClaveTramo = tuple[int, int | None, int | None]


@dataclass(frozen=True)
class EstadoTramo:
    clave: ClaveTramo
    nombre_origen: str | None
    nombre_llegada: str | None
    fecha_salida: date | None
    fecha_llegada: date | None
    # Día del itinerario donde se muestra.
    fecha_dia: date
    estado: str = PENDIENTE
    validez: str = VALIDO
    revisar_horario: bool = False
    fila: TramoTrasladoViaje | None = None

    @property
    def tipo(self) -> int:
        return self.clave[0]

    @property
    def actividad(self) -> ActividadItinerario | None:
        return self.fila.Actividad if self.fila else None

    @property
    def mismo_dia(self) -> bool:
        return self.fecha_salida == self.fecha_llegada


def error_traslado(status_code: int, mensaje: str, codigo: str) -> HTTPException:
    return HTTPException(
        status_code=status_code, detail=mensaje, headers={"X-Error-Code": codigo}
    )


def nombre_traslado(medio: str, tipo: int, destino: str | None) -> str:
    nombre_medio = NOMBRES_MEDIOS.get(medio, "Traslado")
    if tipo == TIPO_TRAMO_REGRESO:
        return f"{nombre_medio} de regreso"
    return f"{nombre_medio} a {destino}"[:150]


def _destinos_ordenados(viaje: Viaje) -> list[DestinoViaje]:
    return sorted(viaje.Destinos, key=lambda d: (d.Orden, d.IdDestino))


def clave_de_fila(fila: TramoTrasladoViaje) -> ClaveTramo:
    return (fila.IdTipoTramoTraslado, fila.IdDestinoOrigen, fila.IdDestinoLlegada)


def clave_de_ref(ref: TramoRef) -> ClaveTramo:
    tipo = TIPOS_POR_CODIGO[ref.tipo]
    if tipo == TIPO_TRAMO_ENTRE_DESTINOS:
        return (tipo, ref.idDestinoOrigen, ref.idDestinoLlegada)
    return (tipo, None, None)


def _tramos_vigentes(viaje: Viaje) -> list[EstadoTramo]:
    """Ida, tramos entre destinos consecutivos (solo con recorrido armado) y regreso."""
    destinos = _destinos_ordenados(viaje)
    if not destinos:
        return []

    inicio, fin = viaje.FechaInicio, viaje.FechaFin
    tramos = [
        EstadoTramo(
            clave=(TIPO_TRAMO_IDA, None, None),
            nombre_origen=None,
            nombre_llegada=destinos[0].Destino.Nombre,
            fecha_salida=inicio,
            fecha_llegada=inicio,
            fecha_dia=inicio,
        )
    ]
    if recorrido_armado(destinos):
        calculados = calcular_tramos(destinos, inicio)
        for origen, llegada, tramo in zip(destinos, destinos[1:], calculados):
            tramos.append(
                EstadoTramo(
                    clave=(TIPO_TRAMO_ENTRE_DESTINOS, origen.IdDestino, llegada.IdDestino),
                    nombre_origen=origen.Destino.Nombre,
                    nombre_llegada=llegada.Destino.Nombre,
                    fecha_salida=tramo.salida,
                    fecha_llegada=tramo.llegada_siguiente,
                    fecha_dia=tramo.salida,
                )
            )
    tramos.append(
        EstadoTramo(
            clave=(TIPO_TRAMO_REGRESO, None, None),
            nombre_origen=destinos[-1].Destino.Nombre,
            nombre_llegada=None,
            fecha_salida=fin,
            fecha_llegada=fin,
            fecha_dia=fin,
        )
    )
    return tramos


def _traslado_fuera_del_recorrido(viaje: Viaje, fila: TramoTrasladoViaje) -> EstadoTramo:
    destinos = _destinos_ordenados(viaje)
    armado = recorrido_armado(destinos)
    pares = {(a.IdDestino, b.IdDestino) for a, b in zip(destinos, destinos[1:])}
    par = (fila.IdDestinoOrigen, fila.IdDestinoLlegada)
    datos = dict(
        clave=clave_de_fila(fila),
        nombre_origen=fila.DestinoOrigen.Nombre if fila.DestinoOrigen else None,
        nombre_llegada=fila.DestinoLlegada.Nombre if fila.DestinoLlegada else None,
        fecha_llegada=None,
        estado=AGENDADO,
        fila=fila,
    )

    if not armado and par in pares:
        return EstadoTramo(
            **datos, fecha_salida=None, fecha_dia=viaje.FechaInicio, validez=SIN_FECHA
        )

    fecha = viaje.FechaInicio
    if armado:
        salidas = {
            destino.IdDestino: tramo.salida
            for destino, tramo in zip(destinos, calcular_tramos(destinos, viaje.FechaInicio))
        }
        fecha = salidas.get(fila.IdDestinoOrigen, viaje.FechaInicio)
    return EstadoTramo(**datos, fecha_salida=fecha, fecha_dia=fecha, validez=NO_CORRESPONDE)


def _con_fila(tramo: EstadoTramo, fila: TramoTrasladoViaje | None) -> EstadoTramo:
    if fila is None:
        return tramo
    actividad = fila.Actividad
    if actividad is None:
        estado = OCULTO if fila.Oculto else PENDIENTE
        return replace(tramo, estado=estado, fila=fila)
    revisar = (
        tramo.tipo == TIPO_TRAMO_ENTRE_DESTINOS
        and tramo.mismo_dia
        and actividad.HoraFin <= actividad.HoraInicio
    )
    return replace(tramo, estado=AGENDADO, fila=fila, revisar_horario=revisar)


def estados_tramos(viaje: Viaje) -> list[EstadoTramo]:
    """Tramos vigentes con su estado, más los traslados que quedaron fuera del recorrido."""
    filas = {clave_de_fila(fila): fila for fila in viaje.TramosTraslados}
    vigentes = _tramos_vigentes(viaje)
    claves = {tramo.clave for tramo in vigentes}
    estados = [_con_fila(tramo, filas.get(tramo.clave)) for tramo in vigentes]
    estados.extend(
        _traslado_fuera_del_recorrido(viaje, fila)
        for clave, fila in filas.items()
        if clave not in claves and fila.Actividad is not None
    )
    return estados


def _datos_read(estado: EstadoTramo) -> dict:
    return dict(
        tipo=CODIGOS_TIPOS[estado.tipo],
        idDestinoOrigen=estado.clave[1],
        idDestinoLlegada=estado.clave[2],
        nombreOrigen=estado.nombre_origen,
        nombreLlegada=estado.nombre_llegada,
        fechaSalida=estado.fecha_salida,
        fechaLlegada=estado.fecha_llegada,
        validez=estado.validez,
        revisarHorario=estado.revisar_horario,
    )


def tramos_read(viaje: Viaje) -> list[TramoTrasladoRead]:
    dias = {dia.Fecha: dia.IdDiaCronograma for dia in viaje.Cronograma}
    return [
        TramoTrasladoRead(
            **_datos_read(estado),
            estado=estado.estado,
            idDiaCronograma=dias.get(estado.fecha_dia),
            idActividad=estado.actividad.IdActividad if estado.actividad else None,
        )
        for estado in estados_tramos(viaje)
    ]


def traslados_por_actividad(viaje: Viaje) -> dict[int, TrasladoActividadRead]:
    return {
        estado.actividad.IdActividad: TrasladoActividadRead(**_datos_read(estado))
        for estado in estados_tramos(viaje)
        if estado.actividad is not None
    }


def buscar_tramo(viaje: Viaje, clave: ClaveTramo) -> EstadoTramo | None:
    return next((e for e in estados_tramos(viaje) if e.clave == clave), None)


def tramo_disponible(viaje: Viaje, ref: TramoRef) -> EstadoTramo:
    """Tramo vigente y sin traslado, o el error que explica por qué no se puede usar."""
    estado = buscar_tramo(viaje, clave_de_ref(ref))
    if estado is None or estado.validez != VALIDO:
        raise error_traslado(
            status.HTTP_409_CONFLICT,
            "Ese tramo ya no forma parte del recorrido del viaje.",
            TRANSFER_SEGMENT_NOT_AVAILABLE,
        )
    if estado.estado == AGENDADO:
        raise error_traslado(
            status.HTTP_409_CONFLICT,
            "Ese tramo ya tiene un traslado agendado.",
            TRANSFER_ALREADY_EXISTS,
        )
    return estado


def validar_medio(medio: str | None) -> str:
    if medio not in NOMBRES_MEDIOS:
        raise error_traslado(
            status.HTTP_400_BAD_REQUEST,
            "Elegí el medio de transporte.",
            TRANSFER_MEDIUM_REQUIRED,
        )
    return medio


def resolver_horas(
    tipo: int, hora_salida: time | None, hora_llegada: time | None, mismo_dia: bool
) -> tuple[time, time]:
    """`HoraInicio` y `HoraFin` de la actividad. `mismo_dia` en False saltea la comparación."""
    faltante = (
        (tipo == TIPO_TRAMO_IDA and hora_llegada is None)
        or (tipo == TIPO_TRAMO_REGRESO and hora_salida is None)
        or (tipo == TIPO_TRAMO_ENTRE_DESTINOS and (hora_salida is None or hora_llegada is None))
    )
    if faltante:
        raise error_traslado(
            status.HTTP_400_BAD_REQUEST,
            "Completá las horas del traslado.",
            TRANSFER_TIME_REQUIRED,
        )
    if tipo == TIPO_TRAMO_IDA:
        return hora_llegada, hora_llegada
    if tipo == TIPO_TRAMO_REGRESO:
        return hora_salida, hora_salida
    if mismo_dia and hora_llegada <= hora_salida:
        raise error_traslado(
            status.HTTP_400_BAD_REQUEST,
            "La hora de llegada debe ser posterior a la de salida.",
            TRANSFER_TIME_INVALID,
        )
    return hora_salida, hora_llegada


def _dias_por_fecha(viaje: Viaje) -> dict:
    return {dia.Fecha: dia for dia in viaje.Cronograma}


def _actividades_comunes(dia) -> list[ActividadItinerario]:
    if dia is None:
        return []
    return [a for a in dia.Actividades if a.IdTramoTraslado is None]


def actividades_superpuestas(
    viaje: Viaje,
    estado: EstadoTramo,
    hora_salida: time,
    hora_llegada: time,
) -> list[ActividadItinerario]:
    """Actividades mientras viajan. El día de salida cuenta lo que sigue después de la
    salida y el de llegada, lo que empieza antes de la llegada. Los días completos en
    viaje no se controlan."""
    dias = _dias_por_fecha(viaje)
    salida = _actividades_comunes(dias.get(estado.fecha_salida))
    llegada = _actividades_comunes(dias.get(estado.fecha_llegada))

    if estado.tipo == TIPO_TRAMO_IDA:
        superpuestas = [a for a in llegada if a.HoraInicio < hora_llegada]
    elif estado.tipo == TIPO_TRAMO_REGRESO:
        superpuestas = [a for a in salida if a.HoraFin > hora_salida]
    elif estado.mismo_dia:
        superpuestas = [
            a for a in salida if a.HoraInicio < hora_llegada and hora_salida < a.HoraFin
        ]
    else:
        superpuestas = [a for a in salida if a.HoraFin > hora_salida]
        superpuestas += [a for a in llegada if a.HoraInicio < hora_llegada]
    return sorted(superpuestas, key=lambda a: (a.HoraInicio, a.IdActividad))


def mensaje_superposicion(superpuestas: Sequence[ActividadItinerario]) -> str:
    cantidad = len(superpuestas)
    inicio = "Hay 1 actividad" if cantidad == 1 else f"Hay {cantidad} actividades"
    detalle = ", ".join(f"{a.Nombre} ({a.HoraInicio:%H:%M})" for a in superpuestas)
    return f"{inicio} mientras viajan: {detalle}."


@dataclass(frozen=True)
class SeparacionDia:
    """Día de traslado sin noches en viaje. Sin traslado agendado no hay hora de salida,
    así que las actividades quedan sin repartir."""

    tramo: EstadoTramo
    agendado: bool
    antes: list[ActividadItinerario]
    despues: list[ActividadItinerario]


def separar_actividades_dia(viaje: Viaje, dia) -> SeparacionDia | None:
    """Reparte las actividades de un día de traslado entre los dos destinos: lo que empieza
    antes de la salida es del destino de salida y el resto, del de llegada. Devuelve None si
    el día no es de traslado. Misma regla que `separarActividadesDia` del frontend."""
    tramo = next(
        (
            estado
            for estado in estados_tramos(viaje)
            if estado.tipo == TIPO_TRAMO_ENTRE_DESTINOS
            and estado.validez == VALIDO
            and estado.mismo_dia
            and estado.fecha_salida == dia.Fecha
        ),
        None,
    )
    if tramo is None:
        return None
    if tramo.actividad is None:
        return SeparacionDia(tramo, False, [], [])

    salida = tramo.actividad.HoraInicio
    comunes = _actividades_comunes(dia)
    return SeparacionDia(
        tramo,
        True,
        [a for a in comunes if a.HoraInicio < salida],
        [a for a in comunes if a.HoraInicio >= salida],
    )


def fila_del_tramo(db: Session, viaje: Viaje, estado: EstadoTramo) -> TramoTrasladoViaje:
    if estado.fila is not None:
        return estado.fila
    fila = TramoTrasladoViaje(
        IdViaje=viaje.IdViaje,
        IdTipoTramoTraslado=estado.tipo,
        IdDestinoOrigen=estado.clave[1],
        IdDestinoLlegada=estado.clave[2],
    )
    db.add(fila)
    db.flush()
    return fila


def mover_de_dia(actividad: ActividadItinerario, dia) -> None:
    """Pasa la actividad por las colecciones: `DiaCronograma.Actividades` es delete-orphan
    y borrar el día viejo la arrastraría si quedara en su colección."""
    anterior = actividad.DiaCronograma
    if anterior is dia:
        return
    if anterior is not None:
        anterior.Actividades.remove(actividad)
    dia.Actividades.append(actividad)


def sincronizar_traslados(db: Session, viaje: Viaje) -> None:
    """Deja cada traslado en el día que le corresponde según el recorrido actual. Se llama
    después de guardar destinos y crear los días, y antes de borrar los días sobrantes."""
    db.flush()
    db.expire(viaje, ["Destinos", "Cronograma", "TramosTraslados"])
    dias = _dias_por_fecha(viaje)

    estados = estados_tramos(viaje)
    for estado in estados:
        actividad = estado.actividad
        if actividad is None:
            continue
        dia = dias.get(estado.fecha_dia) or viaje.Cronograma[0]
        mover_de_dia(actividad, dia)
        if estado.tipo == TIPO_TRAMO_IDA:
            actividad.Nombre = nombre_traslado(actividad.Icono, estado.tipo, estado.nombre_llegada)

    # Una tarjeta oculta de un tramo que ya no existe no tiene nada que recordar.
    claves = {estado.clave for estado in estados}
    for fila in list(viaje.TramosTraslados):
        if fila.Actividad is None and clave_de_fila(fila) not in claves:
            viaje.TramosTraslados.remove(fila)
    db.flush()


def ocupacion_traslados(viaje: Viaje) -> dict[int, list[tuple[int, int]]]:
    """Minutos ocupados por día por los traslados agendados, incluida la parte que cae en
    un día distinto al de salida. Los traslados sin fecha válida no ocupan nada."""
    dias = _dias_por_fecha(viaje)
    ocupados: dict[int, list[tuple[int, int]]] = {}

    def ocupar(fecha: date | None, inicio: int, fin: int) -> None:
        dia = dias.get(fecha)
        if dia is not None:
            ocupados.setdefault(dia.IdDiaCronograma, []).append((inicio, fin))

    for estado in estados_tramos(viaje):
        actividad = estado.actividad
        if actividad is None or estado.validez != VALIDO:
            continue
        salida, llegada = minutos_de(actividad.HoraInicio), minutos_de(actividad.HoraFin)
        if estado.tipo == TIPO_TRAMO_IDA:
            ocupar(estado.fecha_llegada, 0, llegada)
        elif estado.tipo == TIPO_TRAMO_REGRESO:
            ocupar(estado.fecha_salida, salida, ULTIMO_MINUTO_DEL_DIA)
        elif estado.mismo_dia and llegada > salida:
            ocupar(estado.fecha_salida, salida, llegada)
        elif estado.mismo_dia:
            ocupar(estado.fecha_salida, salida, ULTIMO_MINUTO_DEL_DIA)
        else:
            ocupar(estado.fecha_salida, salida, ULTIMO_MINUTO_DEL_DIA)
            ocupar(estado.fecha_llegada, 0, llegada)
    return ocupados


def dias_en_viaje(viaje: Viaje) -> set[int]:
    """Días completos arriba de un traslado: los que hay entre la salida y la llegada de un
    tramo del recorrido armado, esté agendado o no."""
    dias = _dias_por_fecha(viaje)
    ids: set[int] = set()
    for estado in _tramos_vigentes(viaje):
        if estado.tipo != TIPO_TRAMO_ENTRE_DESTINOS:
            continue
        fecha = estado.fecha_salida + timedelta(days=1)
        while fecha < estado.fecha_llegada:
            if fecha in dias:
                ids.add(dias[fecha].IdDiaCronograma)
            fecha += timedelta(days=1)
    return ids
