"""Datos sinteticos locales; no representa estadisticas observadas del producto."""

import argparse
import calendar
import json
import random
from collections import Counter
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select, text

# Registra todos los modelos sin iniciar el lifespan ni los schedulers.
from app.main import app as _app  # noqa: F401
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.models.usuario import Usuario
from app.models.plan import Plan
from app.models.rol_sistema import RolSistema
from app.models.estado_viaje import EstadoViaje
from app.models.estado_participacion import EstadoParticipacion
from app.models.rol_participante import RolParticipante
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.pago_suscripcion import EstadoPagoSuscripcion, PagoSuscripcion
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.viaje import Viaje
from app.models.participante_viaje import ParticipanteViaje
from app.models.destino import Destino
from app.models.destino_viaje import DestinoViaje
from app.models.dia_cronograma import DiaCronograma
from app.models.actividad_itinerario import ActividadItinerario
from app.models.moneda import Moneda
from app.models.categorias_gastos import CategoriasGastos
from app.models.categorias_checklist import CategoriasChecklist
from app.models.gasto import Gasto, TipoDivisionEnum
from app.models.participantes_gastos import ParticipantesGastos
from app.models.checklist import Checklist
from app.models.votacion import Votacion, TipoVotacionEnum
from app.models.propuesta import Propuesta
from app.models.voto import Voto
from app.models.solicitud_ia import SolicitudIA

PREFIJO = "demo_cyanea_"
PASSWORD = "CyaneaDemo2026!"
CENTAVO = Decimal("0.01")


def meses_despues(fecha, meses):
    indice = fecha.year * 12 + fecha.month - 1 + meses
    anio, mes = divmod(indice, 12)
    return fecha.replace(
        year=anio, month=mes + 1, day=min(fecha.day, calendar.monthrange(anio, mes + 1)[1])
    )


def validar_destino(url, entorno):
    if (
        url.get_backend_name() != "postgresql"
        or url.host not in {"localhost", "127.0.0.1", "::1"}
        or entorno.lower() not in {"development", "local", "test"}
    ):
        raise ValueError("El seed solo admite PostgreSQL local en development/local/test.")


def generar(db, *, usuarios=800, viajes=300, semilla=113, ahora=None):
    """Inserta sin commit: el llamador controla una unica transaccion atomica."""
    if not 20 <= usuarios <= 10000 or not 1 <= viajes <= 5000:
        raise ValueError("Usar 20..10000 usuarios y 1..5000 viajes.")
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(113202610)"))
    if db.scalar(
        select(Usuario.IdUsuario)
        .where(Usuario.NombreUsuario.startswith(PREFIJO, autoescape=True))
        .limit(1)
    ):
        return {
            "omitido": True,
            "motivo": "El conjunto demo ya existe; no se modifico ningun dato.",
        }
    planes = {p.IdPlan: p for p in db.scalars(select(Plan))}
    if any(i not in planes for i in (1, 2)):
        raise ValueError("Aplicar migraciones y datos maestros de planes antes del seed.")
    pro = planes[2]
    if not pro.PrecioMensualARS or not pro.PrecioAnualARS:
        raise ValueError("Configurar los precios Pro antes del seed.")
    rng = random.Random(semilla)
    ahora = ahora or datetime.now(timezone.utc)
    inicio = ahora - timedelta(days=540)
    resumen = Counter()

    def agregar(objeto, etiqueta):
        db.add(objeto)
        db.flush()
        resumen[etiqueta] += 1
        return objeto

    def maestros(modelo, nombres, campo):
        existentes = {x.Nombre: x for x in db.scalars(select(modelo))}
        for nombre in nombres:
            if nombre not in existentes:
                existentes[nombre] = agregar(modelo(Nombre=nombre), "maestrosNuevos")
        return {n: getattr(existentes[n], campo) for n in nombres}

    if db.get(RolSistema, 1) is None:
        agregar(RolSistema(IdRolSistema=1, Nombre="viajero"), "maestrosNuevos")
    ev = maestros(EstadoViaje, ["borrador", "activo", "finalizado", "cancelado"], "IdEstadoViaje")
    ep = maestros(
        EstadoParticipacion, ["aceptado", "invitado", "rechazado"], "IdEstadoParticipacion"
    )
    rp = maestros(RolParticipante, ["administrador", "participante"], "IdRolParticipante")
    es = maestros(
        EstadoSuscripcion,
        ["activa", "pendiente_pago", "cancelada", "vencida"],
        "IdEstadoSuscripcion",
    )
    pagos = maestros(
        EstadoPagoSuscripcion, ["aprobado", "rechazado", "pendiente"], "IdEstadoPagoSuscripcion"
    )
    if db.get(Moneda, "ARS") is None:
        agregar(Moneda(Codigo="ARS", Nombre="Peso argentino"), "maestrosNuevos")
    cg = list(db.scalars(select(CategoriasGastos).where(CategoriasGastos.Activo.is_(True))))
    cc = list(db.scalars(select(CategoriasChecklist).where(CategoriasChecklist.Activo.is_(True))))
    if not cg or not cc:
        raise ValueError("Se requieren categorias activas de gastos y checklist.")
    clave = hash_password(PASSWORD)
    nombres = [
        "Lucia",
        "Martin",
        "Valentina",
        "Nicolas",
        "Camila",
        "Santiago",
        "Sofia",
        "Mateo",
        "Julieta",
        "Agustin",
        "Florencia",
        "Tomas",
    ]
    apellidos = [
        "Garcia",
        "Gonzalez",
        "Rodriguez",
        "Fernandez",
        "Lopez",
        "Martinez",
        "Perez",
        "Romero",
        "Diaz",
        "Alvarez",
        "Torres",
        "Ruiz",
    ]
    personas = []
    for i in range(usuarios):
        # Sesgo hacia altas recientes y muchos usuarios con poca actividad.
        alta = inicio + timedelta(
            seconds=int((ahora - inicio).total_seconds() * rng.betavariate(2.0, 1.1))
        )
        estado = (
            "activo"
            if i == 0
            else rng.choices(["activo", "sin_confirmar", "suspendido", "baja"], [82, 10, 5, 3])[0]
        )
        acceso = max(
            alta,
            ahora
            - timedelta(
                days=rng.choices(
                    [rng.randint(0, 29), rng.randint(30, 180), rng.randint(181, 520)], [36, 39, 25]
                )[0]
            ),
        )
        u = agregar(
            Usuario(
                Nombre=rng.choice(nombres),
                Apellido=rng.choice(apellidos),
                NombreUsuario=f"{PREFIJO}{i + 1:04d}",
                Email=f"viajero{i + 1:04d}@demo.cyanea.invalid",
                HashedPassword=clave,
                IdRolSistema=1,
                IdPlan=1,
                FechaAlta=alta,
                UltimoAcceso=acceso if estado != "sin_confirmar" else None,
                Activo=estado in {"activo", "sin_confirmar"},
                EmailConfirmado=estado != "sin_confirmar",
                FechaBaja=acceso if estado == "baja" else None,
                FechaSuspension=acceso if estado == "suspendido" else None,
                MotivoSuspension="Suspension simulada para demostracion"
                if estado == "suspendido"
                else None,
                AceptaTerminos=True,
                FechaAceptacionTerminos=alta,
                VersionTerminosAceptada=settings.terms_version,
                PermiteBusquedaPorUsuario=False,
                ConsienteNotificacionesEmail=False,
                ConsienteNotificacionesPush=False,
            ),
            "usuarios",
        )
        if estado == "baja":
            u.Nombre, u.Apellido = "Usuario", "Anonimizado DEMO"
        resumen[f"usuarios_{estado}"] += 1
        personas.append(u)

    elegibles = [u for u in personas if u.Activo and u.EmailConfirmado]
    for u in elegibles:
        if rng.random() > 0.19:
            continue
        meses = rng.choices([1, 12], [78, 22])[0]
        estado = rng.choices(["activa", "cancelada", "vencida", "pendiente_pago"], [65, 12, 14, 9])[
            0
        ]
        # Ultimo periodo empieza despues del alta; meses previos se agregan sin solaparse.
        comienzo = max(
            u.FechaAlta,
            ahora - timedelta(days=rng.randint(1, 27) if meses == 1 else rng.randint(5, 250)),
        )
        if estado == "vencida":
            comienzo = max(
                u.FechaAlta, meses_despues(ahora, -meses) - timedelta(days=rng.randint(2, 60))
            )
            if meses_despues(comienzo, meses) > ahora:
                estado = "pendiente_pago"
        periodos = [(comienzo, estado)]
        anterior = meses_despues(comienzo, -meses)
        for _ in range(rng.randint(0, 6) if meses == 1 else 1):
            if anterior < u.FechaAlta:
                break
            periodos.append((anterior, "vencida"))
            anterior = meses_despues(anterior, -meses)
        for fecha, situacion in reversed(periodos):
            monto = pro.PrecioMensualARS if meses == 1 else pro.PrecioAnualARS
            monto = (
                monto * (Decimal("0.85") if fecha < ahora - timedelta(days=180) else Decimal(1))
            ).quantize(CENTAVO)
            fin = meses_despues(fecha, meses)
            sub = agregar(
                SuscripcionUsuario(
                    IdUsuario=u.IdUsuario,
                    IdPlan=2,
                    IdEstadoSuscripcion=es[situacion],
                    FechaInicio=fecha,
                    FechaFin=fin,
                    FechaCreacion=fecha,
                    MesesPeriodo=meses,
                    PrecioPeriodoARS=monto,
                    FechaCancelacion=min(ahora, fecha + timedelta(days=3))
                    if situacion == "cancelada"
                    else None,
                ),
                "suscripciones",
            )
            resumen[f"suscripciones_{situacion}"] += 1
            estados = (
                ["rechazado", "pendiente"]
                if situacion == "pendiente_pago"
                else (["rechazado", "aprobado"] if rng.random() < 0.12 else ["aprobado"])
            )
            for intento, epago in enumerate(estados):
                agregar(
                    PagoSuscripcion(
                        IdSuscripcionUsuario=sub.IdSuscripcionUsuario,
                        IdEstadoPagoSuscripcion=pagos[epago],
                        FechaPago=min(ahora, fecha + timedelta(hours=intento * 12)),
                        MontoARS=monto,
                        IdOperacionPasarela=f"DEMO-CYANEA-{sub.IdSuscripcionUsuario}-{intento}",
                    ),
                    "pagos",
                )
                resumen[f"pagos_{epago}"] += 1
        if estado in {"activa", "cancelada"}:
            u.IdPlan = 2
    db.flush()

    destinos = []
    for nombre in [
        "Bariloche",
        "Mendoza",
        "Cordoba",
        "Buenos Aires",
        "Salta",
        "Mar del Plata",
        "Ushuaia",
        "Puerto Iguazu",
    ]:
        destino = db.scalar(
            select(Destino).where(Destino.Nombre == nombre, Destino.Pais == "Argentina").limit(1)
        )
        destinos.append(
            destino or agregar(Destino(Nombre=nombre, Pais="Argentina"), "destinosNuevos")
        )
    # Pesos lognormales: un grupo pequeno organiza buena parte de los viajes.
    pesos = [rng.lognormvariate(0, 1.25) for _ in elegibles]
    activos_admin = Counter()
    for i in range(viajes):
        admin = rng.choices(elegibles, weights=pesos)[0]
        estado = rng.choices(["finalizado", "activo", "borrador", "cancelado"], [54, 31, 9, 6])[0]
        if estado == "activo" and activos_admin[admin.IdUsuario] >= (
            planes[admin.IdPlan].MaxViajesActivos or 5
        ):
            estado = "borrador"
        creado = admin.FechaAlta + (ahora - admin.FechaAlta) * rng.random()
        duracion = rng.choices([3, 5, 7, 10, 14], [35, 20, 27, 12, 6])[0]
        if estado == "finalizado":
            if (ahora - creado).days < duracion + 2:
                estado = "activo"
            else:
                salida = creado.date() + timedelta(
                    days=rng.randint(1, (ahora - creado).days - duracion)
                )
        if estado != "finalizado":
            # Mayor frecuencia de escapadas en verano y fines de semana largos.
            opciones = [ahora.date() + timedelta(days=d) for d in range(1, 181)]
            salida = rng.choices(
                opciones, [2.5 if d.month in (1, 2, 7, 12) else 1 for d in opciones]
            )[0]
        if estado == "activo":
            activos_admin[admin.IdUsuario] += 1
        destino = rng.choice(destinos)
        v = agregar(
            Viaje(
                Titulo=f"[DEMO] {destino.Nombre} - {i + 1:03d}",
                Descripcion="Viaje sintetico para probar Cyanea; no es una reserva real.",
                FechaInicio=salida,
                FechaFin=salida + timedelta(days=duracion - 1),
                IdEstadoViaje=ev[estado],
                Moneda="ARS",
                IdAdministrador=admin.IdUsuario,
                FechaCreacion=creado,
                FechaActualizacion=creado,
            ),
            "viajes",
        )
        resumen[f"viajes_{estado}"] += 1
        agregar(DestinoViaje(IdViaje=v.IdViaje, IdDestino=destino.IdDestino), "destinosViajes")
        limite = planes[admin.IdPlan].MaxParticipantesViaje or 3
        cantidad = min(limite, rng.choices([1, 2, 3, 4, 6, 8], [5, 22, 35, 22, 12, 4])[0])
        candidatos = [u for u in elegibles if u != admin and u.FechaAlta <= creado]
        miembros = [admin] + rng.sample(candidatos, min(cantidad - 1, len(candidatos)))
        aceptados = []
        for miembro in miembros:
            situacion = (
                "aceptado"
                if miembro == admin or estado == "finalizado"
                else rng.choices(["aceptado", "invitado", "rechazado"], [86, 10, 4])[0]
            )
            p = agregar(
                ParticipanteViaje(
                    IdViaje=v.IdViaje,
                    IdUsuario=miembro.IdUsuario,
                    IdRolParticipante=rp["administrador" if miembro == admin else "participante"],
                    IdEstadoParticipacion=ep[situacion],
                    FechaInvitacion=creado,
                    FechaRespuesta=creado if situacion != "invitado" else None,
                    FechaIncorporacion=creado if situacion == "aceptado" else None,
                    InvitadoPor=admin.IdUsuario,
                ),
                "participaciones",
            )
            if situacion == "aceptado":
                aceptados.append(p)
            if miembro.UltimoAcceso is None or miembro.UltimoAcceso < creado:
                miembro.UltimoAcceso = creado
        if estado in {"borrador", "cancelado"}:
            continue
        intensidad = min(3, rng.lognormvariate(-0.1, 0.8))
        for d in range(duracion):
            dia = agregar(
                DiaCronograma(IdViaje=v.IdViaje, Fecha=salida + timedelta(days=d), IndiceDia=d + 1),
                "dias",
            )
            for a in range(min(4, int(rng.random() * 3 * intensidad))):
                agregar(
                    ActividadItinerario(
                        IdDiaCronograma=dia.IdDiaCronograma,
                        Nombre=rng.choice(
                            [
                                "Paseo por el centro",
                                "Visita al museo",
                                "Excursion",
                                "Almuerzo en grupo",
                            ]
                        ),
                        HoraInicio=time(9 + a * 3),
                        HoraFin=time(11 + a * 3),
                        FechaCreacion=creado,
                    ),
                    "actividades",
                )
        for _ in range(rng.randint(2, 7)):
            agregar(
                Checklist(
                    IdViaje=v.IdViaje,
                    IdUsuarioCreador=admin.IdUsuario,
                    Nombre=rng.choice(
                        [
                            "Reservar alojamiento",
                            "Preparar equipaje",
                            "Revisar transporte",
                            "Comprar provisiones",
                        ]
                    ),
                    IdCategoriaChecklist=rng.choice(cc).IdCategoriaChecklist,
                    Completada=rng.random() < (0.9 if estado == "finalizado" else 0.35),
                    FechaCreacion=creado,
                    Responsables=[rng.choice(miembros)],
                ),
                "tareas",
            )
        for _ in range(int(rng.randint(2, 10) * intensidad)):
            pagador = rng.choice(aceptados)
            centavos = int(min(2500000, rng.lognormvariate(10, 0.8)) * len(aceptados) * 100)
            monto = Decimal(centavos) / 100
            fecha = min(ahora.date(), salida + timedelta(days=rng.randrange(duracion)))
            registrado = max(
                creado, min(ahora, datetime.combine(fecha, time(18), tzinfo=timezone.utc))
            )
            g = agregar(
                Gasto(
                    IdViaje=v.IdViaje,
                    Nombre=rng.choice(["Alojamiento", "Comida", "Transporte", "Excursion"]),
                    Monto=monto,
                    MontoOriginal=monto,
                    MonedaOriginal="ARS",
                    TipoCambio=1,
                    IdCategoria=rng.choice(cg).IdCategoria,
                    IdPagador=pagador.IdParticipanteViaje,
                    IdParticipanteCreador=pagador.IdParticipanteViaje,
                    TipoDivision=TipoDivisionEnum.igualitaria,
                    FechaGasto=fecha,
                    FechaCreacion=registrado,
                    FechaActualizacion=registrado,
                ),
                "gastos",
            )
            for n, participante in enumerate(aceptados):
                agregar(
                    ParticipantesGastos(
                        IdGasto=g.IdGasto,
                        IdParticipanteViaje=participante.IdParticipanteViaje,
                        MontoAsignado=Decimal(
                            centavos // len(aceptados) + (n < centavos % len(aceptados))
                        )
                        / 100,
                    ),
                    "asignacionesGastos",
                )
        if len(aceptados) > 1 and rng.random() < 0.65:
            votacion = agregar(
                Votacion(
                    IdViaje=v.IdViaje,
                    Titulo="Elegir actividad del grupo",
                    Tipo=TipoVotacionEnum.opcion_unica,
                    IdCreador=admin.IdUsuario,
                    FechaCreacion=creado,
                    FechaActualizacion=creado,
                    FechaCierre=min(ahora + timedelta(days=3), creado + timedelta(days=7)),
                ),
                "votaciones",
            )
            propuestas = [
                agregar(
                    Propuesta(IdVotacion=votacion.IdVotacion, Texto=t, Orden=j + 1), "propuestas"
                )
                for j, t in enumerate(
                    ["Recorrido cultural", "Salida al aire libre", "Dia de descanso"]
                )
            ]
            for p in aceptados:
                if rng.random() < 0.78:
                    agregar(
                        Voto(
                            IdUsuario=p.IdUsuario,
                            IdVotacion=votacion.IdVotacion,
                            IdPropuesta=rng.choice(propuestas).IdPropuesta,
                            FechaVoto=min(ahora, creado + timedelta(hours=2)),
                        ),
                        "votos",
                    )
        for _ in range(int(rng.randint(3, 20) * intensidad)):
            fecha = creado + (ahora - creado) * rng.betavariate(2, 1)
            entrada, salida_tokens = rng.randint(500, 7000), rng.randint(150, 2500)
            exitosa = rng.random() > 0.045
            agregar(
                SolicitudIA(
                    Fecha=fecha,
                    Servicio=rng.choices(
                        [
                            "sugerencia_actividades",
                            "asistente_viaje",
                            "escaneo_comprobantes",
                            "analisis_horarios",
                            "deteccion_gastos_documentos",
                        ],
                        [36, 28, 20, 10, 6],
                    )[0],
                    Modelo="demo-sintetico",
                    Exitosa=exitosa,
                    DuracionMs=int(min(15000, rng.lognormvariate(7.8, 0.65))),
                    TokensEntrada=entrada,
                    TokensSalida=salida_tokens if exitosa else 0,
                    Imagenes=0,
                    CostoEstimadoUSD=(
                        (
                            Decimal(entrada) * Decimal("0.5")
                            + Decimal(salida_tokens if exitosa else 0) * 3
                        )
                        / 1000000
                    ).quantize(Decimal("0.000001")),
                ),
                "solicitudesIA",
            )
    db.flush()
    return {
        "omitido": False,
        "semilla": semilla,
        "fechaReferencia": ahora.isoformat(),
        "datos": "SINTETICOS, supuestos de demostracion sin calibracion empirica",
        **dict(resumen),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--usuarios", type=int, default=800)
    parser.add_argument("--viajes", type=int, default=300)
    parser.add_argument("--semilla", type=int, default=113)
    args = parser.parse_args()
    validar_destino(engine.url, settings.app_env)
    with SessionLocal.begin() as db:
        reporte = generar(db, usuarios=args.usuarios, viajes=args.viajes, semilla=args.semilla)
    print(json.dumps(reporte, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
