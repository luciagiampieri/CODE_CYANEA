"""
Crea un usuario inicial en la base de datos.

Uso (desde la carpeta backend/):
    python scripts/create_user.py
"""
import bcrypt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import Usuario


def main():
    email      = "fatima@cyanea.local"
    password   = "test1234"
    nombre     = "fa"
    apellido   = "chialva"
    username   = "fachialva"

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    engine = create_engine(settings.database_url)

    with Session(engine) as session:
        # Evitar duplicados
        from sqlalchemy import select
        existe = session.scalar(select(Usuario).where(Usuario.Email == email))
        if existe:
            print(f"⚠️  Ya existe un usuario con email '{email}'")
            return

        usuario = Usuario(
            Email=email,
            Nombre=nombre,
            Apellido=apellido,
            NombreUsuario=username,
            HashedPassword=hashed,
            Activo=True,
        )
        session.add(usuario)
        session.commit()
        session.refresh(usuario)
        print(f"✅  Usuario creado: {usuario.Nombre} {usuario.Apellido}")
        print(f"    Email:      {email}")
        print(f"    Contraseña: {password}")
        print(f"    ID:         {usuario.IdUsuario}")


if __name__ == "__main__":
    main()