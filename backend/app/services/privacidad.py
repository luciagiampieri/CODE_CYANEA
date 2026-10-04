"""Reglas de privacidad del perfil (US 61).

Todo dato de un usuario que se le muestre a otro pasa por `datos_visibles`,
de modo que la privacidad se aplica en el backend y nunca llega al cliente
información que el usuario decidió ocultar.
"""

from dataclasses import dataclass

from app.models.usuario import Usuario

VISIBILIDAD_PARTICIPANTES = "participantes"
VISIBILIDAD_PRIVADO = "privado"
VALORES_VISIBILIDAD = (VISIBILIDAD_PARTICIPANTES, VISIBILIDAD_PRIVADO)


@dataclass(frozen=True)
class DatosVisibles:
    nombreCompleto: str
    email: str | None
    fotoUrl: str | None


def _es_visible(valor: str | None) -> bool:
    # Ante un valor desconocido se elige la opción más restrictiva.
    return valor == VISIBILIDAD_PARTICIPANTES


def datos_visibles(
    usuario: Usuario,
    id_observador: int | None,
    *,
    incluir_email: bool = True,
) -> DatosVisibles:
    """Datos de `usuario` que puede ver el usuario `id_observador`.

    Se asume que quien llama ya verificó que el observador comparte un viaje
    con `usuario` (por ejemplo, con `require_trip_access`): "participantes"
    significa visible solo en ese contexto.

    - Cada usuario siempre ve sus propios datos completos.
    - Si el nombre es privado, se muestra el nombre de usuario en su lugar,
      que siempre es visible porque identifica al participante.
    - `incluir_email=False` lo oculta siempre, para contextos fuera de un
      viaje compartido (por ejemplo, la búsqueda de usuarios).
    """
    nombre_real = f"{usuario.Nombre} {usuario.Apellido}".strip()

    if id_observador is not None and usuario.IdUsuario == id_observador:
        return DatosVisibles(
            nombreCompleto=nombre_real,
            email=usuario.Email if incluir_email else None,
            fotoUrl=usuario.FotoUrl,
        )

    return DatosVisibles(
        nombreCompleto=(
            nombre_real if _es_visible(usuario.VisibilidadNombre) else usuario.NombreUsuario
        ),
        email=(
            usuario.Email
            if incluir_email and _es_visible(usuario.VisibilidadEmail)
            else None
        ),
        fotoUrl=usuario.FotoUrl if _es_visible(usuario.VisibilidadFotoPerfil) else None,
    )


def nombre_para_otros(usuario: Usuario) -> str:
    """Nombre con el que otras personas ven a `usuario` en notificaciones y
    correos: el nombre real si es visible, o el nombre de usuario si es privado."""
    return datos_visibles(usuario, None, incluir_email=False).nombreCompleto
