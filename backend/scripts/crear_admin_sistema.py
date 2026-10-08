from datetime import datetime, timezone
from getpass import getpass

from sqlalchemy import select

import app.models
from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.rol_sistema import ROL_ADMIN_SISTEMA
from app.models.usuario import Usuario


def main() -> None:
    email = input("Email: ").strip().lower()
    nombre = input("Nombre: ").strip()
    apellido = input("Apellido: ").strip()
    nombre_usuario = input("Nombre de usuario: ").strip()
    password = getpass("Contraseña: ")
    if password != getpass("Repetir contraseña: "):
        raise SystemExit("Las contraseñas no coinciden.")
    if len(password) < 8:
        raise SystemExit("La contraseña debe tener al menos 8 caracteres.")

    with SessionLocal() as db:
        if db.scalar(select(Usuario).where(Usuario.Email == email)):
            raise SystemExit("Ya existe una cuenta con ese email.")
        if db.scalar(select(Usuario).where(Usuario.NombreUsuario == nombre_usuario)):
            raise SystemExit("Ese nombre de usuario ya está en uso.")

        db.add(
            Usuario(
                Email=email,
                Nombre=nombre,
                Apellido=apellido,
                NombreUsuario=nombre_usuario,
                HashedPassword=hash_password(password),
                Activo=True,
                EmailConfirmado=True,
                IdRolSistema=ROL_ADMIN_SISTEMA,
                AceptaTerminos=True,
                FechaAceptacionTerminos=datetime.now(timezone.utc),
                VersionTerminosAceptada=settings.terms_version,
                PermiteBusquedaPorUsuario=False,
            )
        )
        db.commit()

    print(f"Administrador del sistema creado: {email}")


if __name__ == "__main__":
    main()