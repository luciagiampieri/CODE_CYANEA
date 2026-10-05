from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.categorias_checklist import CategoriasChecklist
from app.models.categorias_gastos import CategoriasGastos
from app.models.gasto import Gasto
from app.models.lugar_interes_viaje import LugarInteresViaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.viaje import Viaje
from app.services.liquidacion_service import calcular_balances_participantes
from app.services.trip_access import resolve_trip_status


def _money(value) -> float:
    if isinstance(value, Decimal):
        return float(value)
    return float(value or 0)


def build_trip_context(db: Session, viaje: Viaje, current_user) -> dict:
    participantes = [
        {
            "id": part.IdUsuario,
            "idParticipanteViaje": part.IdParticipanteViaje,
            "nombre": f"{part.Usuario.Nombre} {part.Usuario.Apellido}".strip(),
            "rol": part.RolParticipante.Nombre if part.RolParticipante else None,
            "estado": part.EstadoParticipacion.Nombre if part.EstadoParticipacion else None,
            "esUsuarioActual": part.IdUsuario == current_user.IdUsuario,
        }
        for part in viaje.Participantes
        if part.Usuario is not None
    ]

    dias = [
        {
            "idDia": dia.IdDiaCronograma,
            "indice": dia.IndiceDia,
            "fecha": dia.Fecha.isoformat(),
            "actividades": [
                {
                    "id": act.IdActividad,
                    "nombre": act.Nombre,
                    "descripcion": act.Descripcion,
                    "horaInicio": act.HoraInicio.strftime("%H:%M"),
                    "horaFin": act.HoraFin.strftime("%H:%M"),
                }
                for act in dia.Actividades
            ],
            "tieneRuta": dia.Ruta is not None,
        }
        for dia in viaje.Cronograma
    ]

    total_gastos = db.scalar(
        select(func.coalesce(func.sum(Gasto.Monto), 0)).where(Gasto.IdViaje == viaje.IdViaje)
    )
    gastos_recientes = db.scalars(
        select(Gasto)
        .where(Gasto.IdViaje == viaje.IdViaje)
        .order_by(Gasto.FechaGasto.desc(), Gasto.IdGasto.desc())
        .limit(8)
    ).all()

    try:
        balances = calcular_balances_participantes(db, viaje.IdViaje)
        balances_resumen = [
            {
                "participante": item.NombreParticipante,
                "saldoNeto": _money(item.SaldoNeto),
            }
            for item in balances
        ]
    except Exception:
        balances_resumen = []

    destinos = [
        {
            "nombre": rel.Destino.Nombre,
            "pais": rel.Destino.Pais,
            "provinciaEstado": rel.Destino.ProvinciaEstado,
        }
        for rel in viaje.Destinos
        if rel.Destino is not None
    ]

    participacion = next(
        (part for part in viaje.Participantes if part.IdUsuario == current_user.IdUsuario),
        None,
    )

    categorias_gastos = db.scalars(
        select(CategoriasGastos)
        .where(CategoriasGastos.Activo.is_(True))
        .order_by(CategoriasGastos.Nombre.asc())
    ).all()
    categorias_checklist = db.scalars(
        select(CategoriasChecklist)
        .where(CategoriasChecklist.Activo.is_(True))
        .order_by(CategoriasChecklist.Nombre.asc())
    ).all()
    lugares_guardados = db.scalars(
        select(LugarInteresViaje)
        .where(LugarInteresViaje.IdViaje == viaje.IdViaje)
        .order_by(LugarInteresViaje.FechaAlta.desc())
    ).all()

    return {
        "viaje": {
            "id": viaje.IdViaje,
            "titulo": viaje.Titulo,
            "descripcion": viaje.Descripcion,
            "estado": resolve_trip_status(viaje),
            "fechaInicio": viaje.FechaInicio.isoformat() if viaje.FechaInicio else None,
            "fechaFin": viaje.FechaFin.isoformat() if viaje.FechaFin else None,
            "moneda": viaje.Moneda,
            "destinos": destinos,
        },
        "usuarioActual": {
            "id": current_user.IdUsuario,
            "nombre": f"{current_user.Nombre} {current_user.Apellido}".strip(),
            "puedeEditar": participacion is not None
            and participacion.EstadoParticipacion is not None
            and participacion.EstadoParticipacion.Nombre == "aceptado",
        },
        "participantes": participantes,
        "itinerario": dias,
        "gastos": {
            "total": _money(total_gastos),
            "recientes": [
                {
                    "id": gasto.IdGasto,
                    "nombre": gasto.Nombre,
                    "monto": _money(gasto.Monto),
                    "moneda": viaje.Moneda,
                    "fecha": gasto.FechaGasto.isoformat() if gasto.FechaGasto else None,
                }
                for gasto in gastos_recientes
            ],
            "balances": balances_resumen,
        },
        "categorias": {
            "gastos": [
                {"id": categoria.IdCategoria, "nombre": categoria.Nombre}
                for categoria in categorias_gastos
            ],
            "checklist": [
                {"id": categoria.IdCategoriaChecklist, "nombre": categoria.Nombre}
                for categoria in categorias_checklist
            ],
        },
        "lugaresGuardados": [
            {
                "idLugarInteresViaje": lugar.IdLugarInteresViaje,
                "idLugarInteres": lugar.IdLugarInteres,
                "nombre": lugar.LugarInteres.Nombre if lugar.LugarInteres else None,
                "direccion": lugar.LugarInteres.Direccion if lugar.LugarInteres else None,
                "categoria": lugar.LugarInteres.Categoria if lugar.LugarInteres else None,
            }
            for lugar in lugares_guardados
            if lugar.LugarInteres is not None
        ],
    }
