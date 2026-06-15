"""
Uso (desde la carpeta backend/):
    python scripts/set_password.py <email> <contraseña>

Ejemplo:
    python scripts/set_password.py luciano@cyanea.local test1234
"""
import sys
import bcrypt
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import Usuario


def main():
    if len(sys.argv) != 3:
        print("Uso: python scripts/set_password.py <email> <contraseña>")
        sys.exit(1)

    email = sys.argv[1].strip().lower()
    plain_password = sys.argv[2]

    hashed = bcrypt.hashpw(plain_password.encode(), bcrypt.gensalt()).decode()

    engine = create_engine(settings.database_url)

    with Session(engine) as session:
        usuario = session.scalar(
            select(Usuario).where(Usuario.Email == email)
        )
        if usuario is None:
            print(f"❌  No existe ningún usuario con email '{email}'")
            sys.exit(1)

        usuario.HashedPassword = hashed
        session.commit()
        print(f"✅  Contraseña seteada para {usuario.Nombre} {usuario.Apellido} ({email})")


if __name__ == "__main__":
    main()