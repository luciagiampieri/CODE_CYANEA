import logging
from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)


@dataclass
class FacebookIdentity:
    id: str
    email: str | None
    name: str
    first_name: str
    last_name: str
    picture: str | None


class FacebookAuthService:
    debug_token_url = "https://graph.facebook.com/debug_token"
    profile_url = "https://graph.facebook.com/me"

    def verify_access_token(self, access_token: str) -> FacebookIdentity:
        if not settings.facebook_auth_enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="La autenticación con Facebook no esta habilitada.",
            )

        if not settings.facebook_app_id or not settings.facebook_app_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falta configurar las credenciales de Facebook.",
            )

        app_access_token = f"{settings.facebook_app_id}|{settings.facebook_app_secret}"

        # Validar el token de acceso de Facebook usando la API de depuración de tokens
        try:
            debug_response = httpx.get(
                self.debug_token_url,
                params={"input_token": access_token, "access_token": app_access_token},
                timeout=10.0,
            )
            debug_response.raise_for_status()
            debug_data = debug_response.json().get("data", {})
        except httpx.HTTPError as exc:
            logger.info("Facebook token debug failed: %s", str(exc))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No se pudo validar el token de Facebook.",
            )

        if not debug_data.get("is_valid"):
            logger.info("Facebook token inválido: %s", debug_data)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="El token de Facebook no es válido.",
            )

        if str(debug_data.get("app_id")) != str(settings.facebook_app_id):
            logger.info("Facebook token app_id mismatch: %s", debug_data.get("app_id"))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="El token de Facebook no corresponde a esta aplicación.",
            )

        # Obtener el perfil del usuario de Facebook
        try:
            profile_response = httpx.get(
                self.profile_url,
                params={
                    "fields": "id,email,first_name,last_name,name,picture.type(large)",
                    "access_token": access_token,
                },
                timeout=10.0,
            )
            profile_response.raise_for_status()
            profile_data = profile_response.json()
        except httpx.HTTPError as exc:
            logger.info("Facebook profile lookup failed: %s", str(exc))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No se pudo obtener el perfil de Facebook.",
            )

        facebook_id = profile_data.get("id")
        if not facebook_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No se pudo validar la identidad de Facebook.",
            )

        picture = None
        picture_data = profile_data.get("picture")
        if isinstance(picture_data, dict):
            picture = picture_data.get("data", {}).get("url")

        return FacebookIdentity(
            id=str(facebook_id),
            email=(profile_data.get("email") or "").strip().lower() or None,
            name=(profile_data.get("name") or "").strip(),
            first_name=(profile_data.get("first_name") or "").strip(),
            last_name=(profile_data.get("last_name") or "").strip(),
            picture=picture,
        )

    def resolve_existing_user(self, db: Session, identity: FacebookIdentity) -> Usuario:
        """
        Criterio de aceptación de la US: la cuenta de Facebook debe estar
        asociada a una cuenta existente en el sistema.
        Este método NO crea usuarios nuevos: si no encuentra una cuenta ya
        vinculada por FacebookId, la autenticación falla.
        """
        usuario = db.scalar(select(Usuario).where(Usuario.FacebookId == identity.id))
        if usuario:
            return self._sync_facebook_user(db, usuario, identity)
                
        logger.info(
            "Facebook login sin cuenta asociada. FacebookId=%s email=%s",
            identity.id,
            identity.email,
        )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="La cuenta de Facebook no está asociada a ninguna cuenta existente en el sistema.",
        )

    def _sync_facebook_user(self, db: Session, usuario: Usuario, identity: FacebookIdentity) -> Usuario:
        changed = False
        if identity.picture and usuario.FotoUrl != identity.picture:
            usuario.FotoUrl = identity.picture
            changed = True
        if changed:
            db.commit()
            db.refresh(usuario)
        return usuario