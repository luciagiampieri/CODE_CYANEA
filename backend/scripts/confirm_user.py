from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.usuario import Usuario

def confirm():
    engine = create_engine(settings.database_url)
    with Session(engine) as session:
        user = session.query(Usuario).filter(Usuario.Email == "fatima@cyanea.local").first()
        if user:
            user.EmailConfirmado = True
            session.commit()
            print(f"✅ Usuario {user.Email} confirmado correctamente.")
        else:
            print("❌ Usuario no encontrado.")

if __name__ == "__main__":
    confirm()