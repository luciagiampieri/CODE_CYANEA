"""Simula una suscripción Pro para probar la US 121 sin Mercado Pago.

Uso:
  python -m scripts.simular_suscripcion crear --email vos@mail.com --dias 2
  python -m scripts.simular_suscripcion mover --email vos@mail.com --dias -0.01
"""

import argparse
from datetime import datetime, timedelta, timezone

import app.main  # noqa: F401  (registra todos los modelos)

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.estado_suscripcion import EstadoSuscripcion
from app.models.plan import PLAN_PRO
from app.models.suscripcion_usuario import SuscripcionUsuario
from app.models.usuario import Usuario
from app.services.precios_suscripciones import crear_periodo


def _usuario(db, email: str) -> Usuario:
    usuario = db.scalar(select(Usuario).where(Usuario.Email == email))
    if usuario is None:
        raise SystemExit(f"No existe un usuario con el email {email}")
    return usuario


def crear(db, usuario: Usuario, estado: str, fin: datetime) -> SuscripcionUsuario:
    id_estado = db.scalar(
        select(EstadoSuscripcion.IdEstadoSuscripcion).where(EstadoSuscripcion.Nombre == estado)
    )
    if id_estado is None:
        raise SystemExit(f"No existe el estado de suscripción '{estado}'")
    ahora = datetime.now(timezone.utc)
    suscripcion = crear_periodo(
        db,
        id_usuario=usuario.IdUsuario,
        id_estado=id_estado,
        meses=1,
        inicio=fin - timedelta(days=30),
    )
    suscripcion.FechaInicio = fin - timedelta(days=30)
    suscripcion.FechaFin = fin
    suscripcion.FechaAceptacionRenovacion = suscripcion.FechaInicio
    suscripcion.IdSuscripcionPasarela = None  # sin Mercado Pago
    suscripcion.EstadoPasarela = None
    if estado == "cancelada":
        suscripcion.FechaCancelacion = ahora
    usuario.IdPlan = PLAN_PRO
    db.commit()
    return suscripcion


def mover(db, usuario: Usuario, fin: datetime) -> SuscripcionUsuario:
    suscripcion = db.scalar(
        select(SuscripcionUsuario)
        .where(SuscripcionUsuario.IdUsuario == usuario.IdUsuario)
        .order_by(SuscripcionUsuario.IdSuscripcionUsuario.desc())
        .limit(1)
    )
    if suscripcion is None:
        raise SystemExit("El usuario no tiene suscripciones. Usá 'crear' primero.")
    suscripcion.FechaFin = fin
    db.commit()
    return suscripcion


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("accion", choices=["crear", "mover"])
    parser.add_argument("--email", required=True)
    parser.add_argument(
        "--dias", type=float, required=True,
        help="Días desde ahora hasta el fin del período (negativo = ya terminó)",
    )
    parser.add_argument("--estado", default="cancelada", choices=["cancelada", "vencida"])
    args = parser.parse_args()

    fin = datetime.now(timezone.utc) + timedelta(days=args.dias)
    with SessionLocal() as db:
        usuario = _usuario(db, args.email)
        if args.accion == "crear":
            suscripcion = crear(db, usuario, args.estado, fin)
        else:
            suscripcion = mover(db, usuario, fin)
        print(
            f"Suscripción {suscripcion.IdSuscripcionUsuario} de {usuario.Email}: "
            f"fin {suscripcion.FechaFin}, plan Pro"
        )


if __name__ == "__main__":
    main()