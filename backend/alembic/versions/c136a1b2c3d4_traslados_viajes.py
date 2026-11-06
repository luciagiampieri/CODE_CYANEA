"""US 136: traslados por tramo del recorrido y categorías de actividades.

Las actividades con ícono de Vuelo (plane) o Traslado (car) dejan de ser categorías: las
que caen en un día de traslado se convierten en el traslado de ese tramo y el resto pasa
a "Otro". El downgrade no recupera íconos ni nombres.
"""

from datetime import timedelta

from alembic import op
import sqlalchemy as sa

revision = "c136a1b2c3d4"
down_revision = "b130a1b2c3d4"
branch_labels = None
depends_on = None

TIPO_IDA = 1
TIPO_ENTRE_DESTINOS = 2
TIPO_REGRESO = 3

ICONO_OTRO = "location-dot"
NOMBRES_MEDIOS = {"plane": "Avión", "car": "Auto"}

ACTIVIDADES = sa.table(
    "ActividadesItinerario",
    sa.column("IdActividad", sa.Integer),
    sa.column("IdDiaCronograma", sa.Integer),
    sa.column("IdTramoTraslado", sa.Integer),
    sa.column("Nombre", sa.String),
    sa.column("Descripcion", sa.Text),
    sa.column("HoraInicio", sa.Time),
    sa.column("HoraFin", sa.Time),
    sa.column("Icono", sa.String),
    sa.column("TipoAdvertenciaHorario", sa.String),
    sa.column("AdvertenciaHorario", sa.String),
)
DIAS = sa.table(
    "DiasCronogramas",
    sa.column("IdDiaCronograma", sa.Integer),
    sa.column("IdViaje", sa.Integer),
    sa.column("Fecha", sa.Date),
)
VIAJES = sa.table(
    "Viajes",
    sa.column("IdViaje", sa.Integer),
    sa.column("FechaInicio", sa.Date),
    sa.column("FechaFin", sa.Date),
)
DESTINOS_VIAJES = sa.table(
    "DestinosViajes",
    sa.column("IdViaje", sa.Integer),
    sa.column("IdDestino", sa.Integer),
    sa.column("Orden", sa.Integer),
    sa.column("Noches", sa.Integer),
    sa.column("NochesEnViaje", sa.Integer),
)
DESTINOS = sa.table(
    "Destinos",
    sa.column("IdDestino", sa.Integer),
    sa.column("Nombre", sa.String),
)
TRAMOS = sa.table(
    "TramosTrasladosViajes",
    sa.column("IdTramoTraslado", sa.Integer),
    sa.column("IdViaje", sa.Integer),
    sa.column("IdTipoTramoTraslado", sa.Integer),
    sa.column("IdDestinoOrigen", sa.Integer),
    sa.column("IdDestinoLlegada", sa.Integer),
    sa.column("Oculto", sa.Boolean),
)


def tramos_por_fecha(fecha_inicio, fecha_fin, destinos):
    """Tramos de cada día, en orden. Es la misma cuenta que `calcularTramos`, repetida acá
    para que la migración no cambie si cambia el código de la app.

    `destinos`: filas ordenadas con IdDestino, Nombre, Noches y NochesEnViaje."""
    tramos = {}

    def agregar(fecha, tramo):
        tramos.setdefault(fecha, []).append(tramo)

    if not destinos:
        return tramos

    agregar(
        fecha_inicio,
        {"tipo": TIPO_IDA, "origen": None, "llegada": None, "nombre": destinos[0]["Nombre"]},
    )
    if len(destinos) > 1 and all(d["Noches"] is not None for d in destinos):
        llegada = fecha_inicio
        for actual, siguiente in zip(destinos, destinos[1:]):
            salida = llegada + timedelta(days=actual["Noches"])
            agregar(
                salida,
                {
                    "tipo": TIPO_ENTRE_DESTINOS,
                    "origen": actual["IdDestino"],
                    "llegada": siguiente["IdDestino"],
                    "nombre": siguiente["Nombre"],
                },
            )
            llegada = salida + timedelta(days=actual["NochesEnViaje"] or 0)
    agregar(fecha_fin, {"tipo": TIPO_REGRESO, "origen": None, "llegada": None, "nombre": None})
    return tramos


def nombre_traslado(icono, tramo):
    medio = NOMBRES_MEDIOS[icono]
    if tramo["tipo"] == TIPO_REGRESO:
        return f"{medio} de regreso"
    return f"{medio} a {tramo['nombre']}"[:150]


def notas_con_nombre_original(descripcion, nombre_original, nombre_nuevo):
    if nombre_original == nombre_nuevo:
        return descripcion
    if descripcion and descripcion.strip():
        return f"{descripcion}\n{nombre_original}"
    return nombre_original


def valores_del_traslado(actividad, tramo):
    nombre = nombre_traslado(actividad["Icono"], tramo)
    inicio, fin = actividad["HoraInicio"], actividad["HoraFin"]
    if tramo["tipo"] == TIPO_IDA:
        inicio = fin
    elif tramo["tipo"] == TIPO_REGRESO:
        fin = inicio
    return {
        "Nombre": nombre,
        "Descripcion": notas_con_nombre_original(
            actividad["Descripcion"], actividad["Nombre"], nombre
        ),
        "HoraInicio": inicio,
        "HoraFin": fin,
        # El análisis de horarios no aplica a los traslados.
        "TipoAdvertenciaHorario": None,
        "AdvertenciaHorario": None,
    }


def _destinos_del_viaje(bind, id_viaje):
    filas = bind.execute(
        sa.select(
            DESTINOS_VIAJES.c.IdDestino,
            DESTINOS_VIAJES.c.Noches,
            DESTINOS_VIAJES.c.NochesEnViaje,
            DESTINOS.c.Nombre,
        )
        .select_from(
            DESTINOS_VIAJES.join(DESTINOS, DESTINOS.c.IdDestino == DESTINOS_VIAJES.c.IdDestino)
        )
        .where(DESTINOS_VIAJES.c.IdViaje == id_viaje)
        .order_by(DESTINOS_VIAJES.c.Orden, DESTINOS_VIAJES.c.IdDestino)
    )
    return [dict(fila._mapping) for fila in filas]


def _crear_tramo(bind, id_viaje, tramo):
    return bind.execute(
        sa.insert(TRAMOS)
        .values(
            IdViaje=id_viaje,
            IdTipoTramoTraslado=tramo["tipo"],
            IdDestinoOrigen=tramo["origen"],
            IdDestinoLlegada=tramo["llegada"],
            Oculto=False,
        )
        .returning(TRAMOS.c.IdTramoTraslado)
    ).scalar_one()


def convertir_actividades(bind):
    candidatas = [
        dict(fila._mapping)
        for fila in bind.execute(
            sa.select(
                ACTIVIDADES.c.IdActividad,
                ACTIVIDADES.c.Nombre,
                ACTIVIDADES.c.Descripcion,
                ACTIVIDADES.c.HoraInicio,
                ACTIVIDADES.c.HoraFin,
                ACTIVIDADES.c.Icono,
                DIAS.c.Fecha,
                VIAJES.c.IdViaje,
                VIAJES.c.FechaInicio,
                VIAJES.c.FechaFin,
            )
            .select_from(
                ACTIVIDADES.join(
                    DIAS, DIAS.c.IdDiaCronograma == ACTIVIDADES.c.IdDiaCronograma
                ).join(VIAJES, VIAJES.c.IdViaje == DIAS.c.IdViaje)
            )
            .where(
                ACTIVIDADES.c.Icono.in_(tuple(NOMBRES_MEDIOS)),
                ACTIVIDADES.c.IdTramoTraslado.is_(None),
            )
            .order_by(
                VIAJES.c.IdViaje,
                DIAS.c.Fecha,
                ACTIVIDADES.c.HoraInicio,
                ACTIVIDADES.c.IdActividad,
            )
        )
    ]

    tramos_de_viaje = {}
    for actividad in candidatas:
        id_viaje = actividad["IdViaje"]
        if id_viaje not in tramos_de_viaje:
            tramos_de_viaje[id_viaje] = tramos_por_fecha(
                actividad["FechaInicio"],
                actividad["FechaFin"],
                _destinos_del_viaje(bind, id_viaje),
            )

        libres = tramos_de_viaje[id_viaje].get(actividad["Fecha"])
        if libres:
            tramo = libres.pop(0)
            valores = valores_del_traslado(actividad, tramo)
            valores["IdTramoTraslado"] = _crear_tramo(bind, id_viaje, tramo)
        else:
            valores = {"Icono": ICONO_OTRO}

        bind.execute(
            sa.update(ACTIVIDADES)
            .where(ACTIVIDADES.c.IdActividad == actividad["IdActividad"])
            .values(**valores)
        )


def upgrade():
    op.create_table(
        "TiposTramosTraslados",
        sa.Column("IdTipoTramoTraslado", sa.Integer(), primary_key=True, autoincrement=False),
        sa.Column("Nombre", sa.String(length=30), nullable=False, unique=True),
        sa.Column("Activo", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute(
        """
        INSERT INTO "TiposTramosTraslados" ("IdTipoTramoTraslado", "Nombre")
        VALUES (1, 'ida'), (2, 'entre_destinos'), (3, 'regreso')
        """
    )
    op.create_table(
        "TramosTrasladosViajes",
        sa.Column("IdTramoTraslado", sa.Integer(), primary_key=True),
        sa.Column("IdViaje", sa.Integer(), nullable=False),
        sa.Column("IdTipoTramoTraslado", sa.Integer(), nullable=False),
        sa.Column("IdDestinoOrigen", sa.Integer(), nullable=True),
        sa.Column("IdDestinoLlegada", sa.Integer(), nullable=True),
        sa.Column("Oculto", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(
            ["IdViaje"],
            ["Viajes.IdViaje"],
            name="FK_TramosTrasladosViajes_Viajes_IdViaje",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["IdTipoTramoTraslado"],
            ["TiposTramosTraslados.IdTipoTramoTraslado"],
            name="FK_TramosTrasladosViajes_TiposTramos_IdTipo",
        ),
        sa.ForeignKeyConstraint(
            ["IdDestinoOrigen"],
            ["Destinos.IdDestino"],
            name="FK_TramosTrasladosViajes_Destinos_IdOrigen",
        ),
        sa.ForeignKeyConstraint(
            ["IdDestinoLlegada"],
            ["Destinos.IdDestino"],
            name="FK_TramosTrasladosViajes_Destinos_IdLlegada",
        ),
        sa.CheckConstraint(
            '("IdTipoTramoTraslado" = 2 AND "IdDestinoOrigen" IS NOT NULL AND "IdDestinoLlegada" IS NOT NULL)'
            ' OR ("IdTipoTramoTraslado" <> 2 AND "IdDestinoOrigen" IS NULL AND "IdDestinoLlegada" IS NULL)',
            name="CK_TramosTrasladosViajes_Destinos",
        ),
    )
    op.create_index(
        "UX_TramosTrasladosViajes_Viaje_Tipo",
        "TramosTrasladosViajes",
        ["IdViaje", "IdTipoTramoTraslado"],
        unique=True,
        postgresql_where=sa.text('"IdTipoTramoTraslado" <> 2'),
    )
    op.create_index(
        "UX_TramosTrasladosViajes_Viaje_Par",
        "TramosTrasladosViajes",
        ["IdViaje", "IdDestinoOrigen", "IdDestinoLlegada"],
        unique=True,
        postgresql_where=sa.text('"IdTipoTramoTraslado" = 2'),
    )

    op.add_column(
        "ActividadesItinerario", sa.Column("IdTramoTraslado", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        "FK_ActIt_TramosTraslados_IdTramoTraslado",
        "ActividadesItinerario",
        "TramosTrasladosViajes",
        ["IdTramoTraslado"],
        ["IdTramoTraslado"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "UX_ActividadesItinerario_IdTramoTraslado",
        "ActividadesItinerario",
        ["IdTramoTraslado"],
    )
    op.execute(
        'ALTER TABLE "ActividadesItinerario" '
        'DROP CONSTRAINT IF EXISTS "CK_ActividadesItinerario_Horarios"'
    )
    op.create_check_constraint(
        "CK_ActividadesItinerario_Horarios",
        "ActividadesItinerario",
        '"HoraFin" > "HoraInicio" OR "IdTramoTraslado" IS NOT NULL',
    )

    convertir_actividades(op.get_bind())


def downgrade():
    # Vuelven a ser actividades comunes: tienen que cumplir fin > inicio otra vez. Se conserva
    # la hora conocida (la llegada de la ida, la salida de los demás) con un minuto de duración;
    # la llegada de un traslado que llega otro día no entra en el mismo día y se pierde.
    op.execute(
        """
        UPDATE "ActividadesItinerario" a
        SET "HoraInicio" = CASE
                WHEN t."IdTipoTramoTraslado" = 1 AND a."HoraFin" > TIME '00:00'
                    THEN a."HoraFin" - INTERVAL '1 minute'
                WHEN t."IdTipoTramoTraslado" = 1 THEN TIME '00:00'
                ELSE LEAST(a."HoraInicio", TIME '23:58')
            END,
            "HoraFin" = CASE
                WHEN t."IdTipoTramoTraslado" = 1 AND a."HoraFin" > TIME '00:00' THEN a."HoraFin"
                WHEN t."IdTipoTramoTraslado" = 1 THEN TIME '00:01'
                WHEN t."IdTipoTramoTraslado" = 3
                    THEN LEAST(a."HoraInicio", TIME '23:58') + INTERVAL '1 minute'
                ELSE TIME '23:59'
            END
        FROM "TramosTrasladosViajes" t
        WHERE t."IdTramoTraslado" = a."IdTramoTraslado" AND a."HoraFin" <= a."HoraInicio"
        """
    )
    op.execute(
        'ALTER TABLE "ActividadesItinerario" '
        'DROP CONSTRAINT IF EXISTS "CK_ActividadesItinerario_Horarios"'
    )
    op.execute(
        'ALTER TABLE "ActividadesItinerario" '
        'DROP CONSTRAINT IF EXISTS "UX_ActividadesItinerario_IdTramoTraslado"'
    )
    op.execute(
        'ALTER TABLE "ActividadesItinerario" '
        'DROP CONSTRAINT IF EXISTS "FK_ActIt_TramosTraslados_IdTramoTraslado"'
    )
    op.execute('ALTER TABLE "ActividadesItinerario" DROP COLUMN IF EXISTS "IdTramoTraslado"')
    op.create_check_constraint(
        "CK_ActividadesItinerario_Horarios",
        "ActividadesItinerario",
        '"HoraFin" > "HoraInicio"',
    )
    op.execute('DROP TABLE IF EXISTS "TramosTrasladosViajes"')
    op.execute('DROP TABLE IF EXISTS "TiposTramosTraslados"')
