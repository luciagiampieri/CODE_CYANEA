"""US 110: gestionar categorías predefinidas desde el backoffice."""

from datetime import date

import pytest

from app.core.security import hash_password
from app.models.categorias_checklist import CategoriasChecklist
from app.models.categorias_documento import CategoriaDocumento
from app.models.categorias_gastos import CategoriasGastos
from app.models.rol_sistema import ROL_ADMIN_SISTEMA, ROL_VIAJERO, RolSistema
from app.models.usuario import Usuario
from app.services.backoffice import categorias_service

URL = "/api/v1/backoffice/categorias"
LOGIN = "/api/v1/backoffice/auth/login"
PASS = "Segura123!"


@pytest.fixture(autouse=True)
def roles_sistema(db_session):
    if db_session.get(RolSistema, ROL_VIAJERO) is None:
        db_session.add_all([
            RolSistema(IdRolSistema=ROL_VIAJERO, Nombre="viajero"),
            RolSistema(IdRolSistema=ROL_ADMIN_SISTEMA, Nombre="administrador_sistema"),
        ])
        db_session.commit()


@pytest.fixture
def headers_admin(client, db_session):
    db_session.add(
        Usuario(
            Email="admin@cyanea.test",
            Nombre="Admin",
            Apellido="Sistema",
            NombreUsuario="admin",
            HashedPassword=hash_password(PASS),
            Activo=True,
            EmailConfirmado=True,
            IdRolSistema=ROL_ADMIN_SISTEMA,
        )
    )
    db_session.commit()
    token = client.post(LOGIN, json={"email": "admin@cyanea.test", "password": PASS}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def categorias(db_session):
    """Categorías base de los tres tipos, incluida la de sistema "Comprobantes"."""
    gastos = [
        CategoriasGastos(Nombre="Comida y Bebida", Icono="utensils", Activo=True),
        CategoriasGastos(Nombre="Transporte", Icono="car", Activo=True),
    ]
    documentos = [
        CategoriaDocumento(Nombre="Vuelos", Icono="plane", Activo=True),
        CategoriaDocumento(Nombre="Comprobantes", Icono="receipt", Activo=True, EsSistema=True),
    ]
    checklist = [
        CategoriasChecklist(Nombre="Documentación", Icono="passport", Activo=True),
        CategoriasChecklist(Nombre="Salud", Icono="kit-medical", Activo=True),
    ]
    db_session.add_all(gastos + documentos + checklist)
    db_session.commit()
    return {"gastos": gastos, "documentos": documentos, "checklist": checklist}


def _crear(client, headers, tipo, nombre, icono="tags"):
    return client.post(URL, json={"tipo": tipo, "nombre": nombre, "icono": icono}, headers=headers)


def _registrar_gasto(client, auth_headers, viaje, id_categoria):
    return client.post(
        "/api/v1/gastos/",
        json={
            "IdViaje": viaje.IdViaje,
            "Nombre": "Cena",
            "MontoOriginal": "1000.00",
            "MonedaOriginal": viaje.Moneda,
            "IdCategoria": id_categoria,
            "FechaGasto": str(date.today()),
            "EsCompartido": False,
        },
        headers=auth_headers,
    )


# --- CA 1: solo administradores del sistema ---------------------------------

def test_viajero_no_puede_gestionar_categorias(client, auth_headers, categorias):
    assert client.get(URL, headers=auth_headers).status_code == 401
    assert _crear(client, auth_headers, "gastos", "Propinas").status_code == 401


def test_sin_token_no_puede_gestionar_categorias(client):
    assert client.get(URL).status_code == 401


# --- CA 2: listado agrupado por tipo ----------------------------------------

def test_listado_agrupado_por_tipo_con_usos(client, headers_admin, categorias, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    comida = categorias["gastos"][0]
    assert _registrar_gasto(client, auth_headers, viaje, comida.IdCategoria).status_code == 200

    r = client.get(URL, headers=headers_admin)
    assert r.status_code == 200
    datos = r.json()
    assert set(datos) == {"gastos", "documentos", "checklist"}
    assert {c["nombre"] for c in datos["gastos"]} == {"Comida y Bebida", "Transporte"}
    assert {c["nombre"] for c in datos["documentos"]} == {"Vuelos", "Comprobantes"}
    item = next(c for c in datos["gastos"] if c["nombre"] == "Comida y Bebida")
    assert item == {
        "id": comida.IdCategoria,
        "tipo": "gastos",
        "nombre": "Comida y Bebida",
        "icono": "utensils",
        "activa": True,
        "esSistema": False,
        "cantidadUsos": 1,
    }
    assert next(c for c in datos["documentos"] if c["nombre"] == "Comprobantes")["esSistema"] is True


# --- CA 3 / CP 1: crear una categoría y ofrecerla al registrar un gasto -----

def test_cp1_crear_categoria_de_gastos_se_ofrece_al_registrar(
    client, headers_admin, categorias, auth_headers, viaje_con_admin
):
    r = _crear(client, headers_admin, "gastos", "  Propinas  ", "hand-holding-dollar")
    assert r.status_code == 201, r.text
    creada = r.json()
    assert creada["nombre"] == "Propinas"
    assert creada["icono"] == "hand-holding-dollar"
    assert creada["activa"] is True

    ofrecidas = client.get("/api/v1/gastos/categories", headers=auth_headers).json()
    propinas = next(c for c in ofrecidas if c["Nombre"] == "Propinas")
    assert propinas["Icono"] == "hand-holding-dollar"

    viaje, _ = viaje_con_admin
    assert _registrar_gasto(client, auth_headers, viaje, creada["id"]).status_code == 200


def test_crear_categoria_de_documentos_y_checklist_se_ofrecen(client, headers_admin, categorias, auth_headers):
    assert _crear(client, headers_admin, "documentos", "Visas", "passport").status_code == 201
    assert _crear(client, headers_admin, "checklist", "Mascotas", "paw").status_code == 201

    documentos = client.get("/api/v1/trips/documents/categories", headers=auth_headers).json()
    assert any(c["Nombre"] == "Visas" and c["Icono"] == "passport" for c in documentos)
    checklist = client.get("/api/v1/trips/checklists/categorias", headers=auth_headers).json()
    assert any(c["Nombre"] == "Mascotas" and c["Icono"] == "paw" for c in checklist)


@pytest.mark.parametrize(
    "payload",
    [
        {"tipo": "gastos", "nombre": "   ", "icono": "tags"},
        {"tipo": "gastos", "nombre": "X" * 51, "icono": "tags"},
        {"tipo": "gastos", "nombre": "Propinas", "icono": "Icono Invalido"},
        {"tipo": "otro", "nombre": "Propinas", "icono": "tags"},
    ],
)
def test_crear_categoria_valida_los_datos(client, headers_admin, categorias, payload):
    assert client.post(URL, json=payload, headers=headers_admin).status_code == 422


# --- CA 4 / CP 2 / CP 3: nombre único dentro del tipo -----------------------

@pytest.mark.parametrize("nombre", ["Transporte", "TRANSPORTE", "transpórte", " Transporte "])
def test_cp2_no_permite_nombre_existente_en_el_mismo_tipo(client, headers_admin, categorias, nombre):
    r = _crear(client, headers_admin, "gastos", nombre)
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == categorias_service.CATEGORY_NAME_DUPLICATED


def test_duplicado_sin_distinguir_acentos(client, headers_admin, categorias):
    r = _crear(client, headers_admin, "checklist", "documentacion")
    assert r.status_code == 409


def test_cp3_permite_el_mismo_nombre_en_otro_tipo(client, headers_admin, categorias):
    r = _crear(client, headers_admin, "documentos", "Transporte", "bus")
    assert r.status_code == 201
    assert r.json()["tipo"] == "documentos"


# --- CA 5: editar nombre e ícono --------------------------------------------

def test_editar_nombre_e_icono(client, headers_admin, categorias):
    transporte = categorias["gastos"][1]
    r = client.put(
        f"{URL}/gastos/{transporte.IdCategoria}",
        json={"nombre": "Movilidad", "icono": "bus"},
        headers=headers_admin,
    )
    assert r.status_code == 200
    assert r.json()["nombre"] == "Movilidad"
    assert r.json()["icono"] == "bus"


def test_editar_conserva_el_nombre_propio_con_otras_mayusculas(client, headers_admin, categorias):
    transporte = categorias["gastos"][1]
    r = client.put(f"{URL}/gastos/{transporte.IdCategoria}", json={"nombre": "TRANSPORTE"}, headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["nombre"] == "TRANSPORTE"


def test_editar_no_permite_nombre_de_otra_categoria(client, headers_admin, categorias):
    transporte = categorias["gastos"][1]
    r = client.put(
        f"{URL}/gastos/{transporte.IdCategoria}", json={"nombre": "comida y bebida"}, headers=headers_admin
    )
    assert r.status_code == 409


def test_editar_categoria_inexistente(client, headers_admin, categorias):
    r = client.put(f"{URL}/gastos/9999", json={"icono": "bus"}, headers=headers_admin)
    assert r.status_code == 404


# --- CA 6 / CP 4: no eliminar una categoría en uso --------------------------

def test_cp4_no_permite_eliminar_categoria_en_uso(client, headers_admin, categorias, auth_headers, viaje_con_admin):
    viaje, _ = viaje_con_admin
    comida = categorias["gastos"][0]
    assert _registrar_gasto(client, auth_headers, viaje, comida.IdCategoria).status_code == 200

    r = client.delete(f"{URL}/gastos/{comida.IdCategoria}", headers=headers_admin)
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == categorias_service.CATEGORY_IN_USE
    assert "desactivarla" in r.json()["detail"]


def test_elimina_categoria_sin_uso(client, headers_admin, categorias, db_session):
    salud = categorias["checklist"][1]
    r = client.delete(f"{URL}/checklist/{salud.IdCategoriaChecklist}", headers=headers_admin)
    assert r.status_code == 204
    assert db_session.get(CategoriasChecklist, salud.IdCategoriaChecklist) is None


# --- CA 7 / CP 5: desactivar una categoría en uso ---------------------------

def test_cp5_desactivar_categoria_en_uso_la_conservan_los_gastos(
    client, headers_admin, categorias, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    comida = categorias["gastos"][0]
    id_gasto = _registrar_gasto(client, auth_headers, viaje, comida.IdCategoria).json()["IdGasto"]

    r = client.patch(f"{URL}/gastos/{comida.IdCategoria}/estado", json={"activa": False}, headers=headers_admin)
    assert r.status_code == 200
    assert r.json()["activa"] is False

    # El gasto existente conserva la categoría.
    gastos = client.get(f"/api/v1/gastos/trips/{viaje.IdViaje}", headers=auth_headers).json()
    gasto = next(g for g in gastos if g["IdGasto"] == id_gasto)
    assert gasto["IdCategoria"] == comida.IdCategoria
    assert gasto["NombreCategoria"] == "Comida y Bebida"
    assert gasto["IconoCategoria"] == "utensils"

    # Ya no se ofrece ni se acepta para gastos nuevos.
    ofrecidas = client.get("/api/v1/gastos/categories", headers=auth_headers).json()
    assert all(c["IdCategoria"] != comida.IdCategoria for c in ofrecidas)
    nuevo = _registrar_gasto(client, auth_headers, viaje, comida.IdCategoria)
    assert nuevo.status_code == 400


def test_editar_gasto_que_conserva_categoria_desactivada(
    client, headers_admin, categorias, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    comida, transporte = categorias["gastos"]
    id_gasto = _registrar_gasto(client, auth_headers, viaje, comida.IdCategoria).json()["IdGasto"]
    client.patch(f"{URL}/gastos/{comida.IdCategoria}/estado", json={"activa": False}, headers=headers_admin)

    payload = {
        "Nombre": "Cena editada",
        "MontoOriginal": "1500.00",
        "MonedaOriginal": viaje.Moneda,
        "IdCategoria": comida.IdCategoria,
        "FechaGasto": str(date.today()),
        "EsCompartido": False,
    }
    r = client.put(f"/api/v1/gastos/{id_gasto}", json=payload, headers=auth_headers)
    assert r.status_code == 200, r.text

    # Cambiarla por otra activa sigue permitido.
    r = client.put(
        f"/api/v1/gastos/{id_gasto}",
        json={**payload, "IdCategoria": transporte.IdCategoria},
        headers=auth_headers,
    )
    assert r.status_code == 200, r.text


def test_documentos_no_ofrecen_categorias_desactivadas(client, headers_admin, categorias, auth_headers):
    vuelos = categorias["documentos"][0]
    client.patch(f"{URL}/documentos/{vuelos.IdCategoriaDocumento}/estado", json={"activa": False}, headers=headers_admin)
    ofrecidas = client.get("/api/v1/trips/documents/categories", headers=auth_headers).json()
    assert [c["Nombre"] for c in ofrecidas] == ["Comprobantes"]


def test_checklist_no_acepta_categoria_desactivada_en_tareas_nuevas(
    client, headers_admin, categorias, auth_headers, viaje_con_admin
):
    viaje, _ = viaje_con_admin
    documentacion, salud = categorias["checklist"]
    creada = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/checklists",
        json={"Nombre": "Pasaporte", "IdCategoriaChecklist": documentacion.IdCategoriaChecklist},
        headers=auth_headers,
    )
    assert creada.status_code in (200, 201), creada.text
    id_tarea = creada.json()["item"]["IdChecklist"]

    client.patch(
        f"{URL}/checklist/{documentacion.IdCategoriaChecklist}/estado", json={"activa": False}, headers=headers_admin
    )

    nueva = client.post(
        f"/api/v1/trips/{viaje.IdViaje}/checklists",
        json={"Nombre": "Visa", "IdCategoriaChecklist": documentacion.IdCategoriaChecklist},
        headers=auth_headers,
    )
    assert nueva.status_code == 400

    # La tarea existente se puede editar conservando su categoría.
    editada = client.put(
        f"/api/v1/trips/{viaje.IdViaje}/checklists/{id_tarea}",
        json={"Nombre": "Pasaporte vigente", "IdCategoriaChecklist": documentacion.IdCategoriaChecklist},
        headers=auth_headers,
    )
    assert editada.status_code == 200, editada.text
    assert editada.json()["item"]["CategoriaChecklist"]["Nombre"] == "Documentación"


def test_reactivar_categoria(client, headers_admin, categorias, auth_headers):
    transporte = categorias["gastos"][1]
    client.patch(f"{URL}/gastos/{transporte.IdCategoria}/estado", json={"activa": False}, headers=headers_admin)
    r = client.patch(f"{URL}/gastos/{transporte.IdCategoria}/estado", json={"activa": True}, headers=headers_admin)
    assert r.status_code == 200
    ofrecidas = client.get("/api/v1/gastos/categories", headers=auth_headers).json()
    assert any(c["IdCategoria"] == transporte.IdCategoria for c in ofrecidas)


# --- CA 8 / CP 6: "Comprobantes" está protegida -----------------------------

def test_cp6_no_permite_desactivar_comprobantes(client, headers_admin, categorias):
    comprobantes = categorias["documentos"][1]
    r = client.patch(
        f"{URL}/documentos/{comprobantes.IdCategoriaDocumento}/estado", json={"activa": False}, headers=headers_admin
    )
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == categorias_service.CATEGORY_SYSTEM_PROTECTED


def test_no_permite_eliminar_comprobantes(client, headers_admin, categorias):
    comprobantes = categorias["documentos"][1]
    r = client.delete(f"{URL}/documentos/{comprobantes.IdCategoriaDocumento}", headers=headers_admin)
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == categorias_service.CATEGORY_SYSTEM_PROTECTED


def test_comprobantes_renombrada_sigue_siendo_la_de_sistema(client, headers_admin, categorias, db_session):
    from app.services.comprobante_gasto import obtener_o_crear_categoria

    comprobantes = categorias["documentos"][1]
    r = client.put(
        f"{URL}/documentos/{comprobantes.IdCategoriaDocumento}",
        json={"nombre": "Tickets y facturas"},
        headers=headers_admin,
    )
    assert r.status_code == 200
    assert obtener_o_crear_categoria(db_session).IdCategoriaDocumento == comprobantes.IdCategoriaDocumento


# --- CA 9 / CP 7: al menos una categoría activa por tipo ---------------------

def test_cp7_no_permite_desactivar_la_ultima_activa_del_tipo(client, headers_admin, categorias):
    comida, transporte = categorias["gastos"]
    assert client.patch(
        f"{URL}/gastos/{comida.IdCategoria}/estado", json={"activa": False}, headers=headers_admin
    ).status_code == 200

    r = client.patch(f"{URL}/gastos/{transporte.IdCategoria}/estado", json={"activa": False}, headers=headers_admin)
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == categorias_service.CATEGORY_LAST_ACTIVE


def test_no_permite_eliminar_la_ultima_activa_del_tipo(client, headers_admin, categorias):
    documentacion, salud = categorias["checklist"]
    assert client.delete(f"{URL}/checklist/{salud.IdCategoriaChecklist}", headers=headers_admin).status_code == 204
    r = client.delete(f"{URL}/checklist/{documentacion.IdCategoriaChecklist}", headers=headers_admin)
    assert r.status_code == 409
    assert r.headers["X-Error-Code"] == categorias_service.CATEGORY_LAST_ACTIVE


def test_permite_eliminar_inactiva_aunque_quede_una_sola_activa(client, headers_admin, categorias):
    comida, transporte = categorias["gastos"]
    client.patch(f"{URL}/gastos/{comida.IdCategoria}/estado", json={"activa": False}, headers=headers_admin)
    assert client.delete(f"{URL}/gastos/{comida.IdCategoria}", headers=headers_admin).status_code == 204


def test_normalizar_nombre():
    assert categorias_service.normalizar_nombre("  Comída   y BEBIDA ") == "comida y bebida"
