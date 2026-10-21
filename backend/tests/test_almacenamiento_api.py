from app.models.categorias_documento import CategoriaDocumento
from app.models.documento_viaje import DocumentoViaje
from app.models.plan import PLAN_GRATUITO, Plan

MB = 1024 * 1024


def _set_limites(db, id_plan, **valores):
    plan = db.get(Plan, id_plan)
    for campo, valor in valores.items():
        setattr(plan, campo, valor)
    db.commit()


def _documento(db, viaje, usuario, tamano):
    categoria = CategoriaDocumento(Nombre="Otros")
    db.add(categoria)
    db.flush()
    db.add(
        DocumentoViaje(
            IdViaje=viaje.IdViaje,
            IdCategoriaDocumento=categoria.IdCategoriaDocumento,
            IdUsuarioSubida=usuario.IdUsuario,
            NombreArchivo="reserva.pdf",
            UrlArchivo="viajes/1/Otros/reserva.pdf",
            TamanoBytes=tamano,
        )
    )
    db.commit()


def test_almacenamiento_del_viaje_por_api(
    client, db_session, viaje_con_admin, usuario_activo, auth_headers
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxAlmacenamientoMb=100)
    _documento(db_session, viaje, usuario_activo, int(2.5 * MB))

    response = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/documents/almacenamiento", headers=auth_headers
    )

    assert response.status_code == 200
    body = response.json()
    assert body["tipoLimite"] == "almacenamiento"
    assert body["limite"] == 100
    assert body["usoActual"] == 2.5
    assert body["ilimitado"] is False


def test_almacenamiento_ilimitado_por_api(
    client, db_session, viaje_con_admin, auth_headers
):
    viaje, _ = viaje_con_admin
    _set_limites(db_session, PLAN_GRATUITO, MaxAlmacenamientoMb=None)

    body = client.get(
        f"/api/v1/trips/{viaje.IdViaje}/documents/almacenamiento", headers=auth_headers
    ).json()

    assert body["limite"] is None
    assert body["ilimitado"] is True