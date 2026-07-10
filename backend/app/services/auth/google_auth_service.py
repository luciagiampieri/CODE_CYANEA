import logging
import secrets
from dataclasses import dataclass

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.usuario import Usuario

logger = logging.getLogger(__name__)


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    given_name: str
    family_name: str
    name: str
    picture: str | None


class GoogleAuthService:
    token_info_url = "https://oauth2.googleapis.com/tokeninfo"
    user_info_url = "https://openidconnect.googleapis.com/v1/userinfo"

    def verify_id_token(self, id_token: str) -> GoogleIdentity:
        if not settings.google_auth_enabled:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="La autenticacion con Google no esta habilitada.",
            )

        if not settings.google_client_ids:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Falta configurar los client IDs de Google.",
            )

        identity = self._verify_as_id_token(id_token)
        if identity:
            return identity

        identity = self._verify_as_access_token(id_token)
        if identity:
            return identity

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No se pudo validar la identidad de Google.",
        )

    def _verify_as_id_token(self, token: str) -> GoogleIdentity | None:
        try:
            response = httpx.get(
                self.token_info_url,
                params={"id_token": token},
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPError as exc:
            detail = None
            if getattr(exc, "response", None) is not None:
                try:
                    detail = exc.response.text
                except Exception:
                    detail = None
            logger.info("Google id_token validation failed: %s", detail or str(exc))
            return None

        audience = data.get("aud")
        issuer = data.get("iss")
        email = (data.get("email") or "").strip().lower()
        sub = data.get("sub") or ""
        email_verified = str(data.get("email_verified", "")).lower() == "true"

        if audience not in settings.google_client_ids:
            logger.info("Google id_token audience mismatch: %s", audience)
            return None

        if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
            logger.info("Google id_token issuer mismatch: %s", issuer)
            return None

        if not email or not sub:
            logger.info("Google id_token missing email or sub")
            return None

        if not email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="La cuenta de Google debe tener el correo verificado.",
            )

        return GoogleIdentity(
            sub=sub,
            email=email,
            email_verified=email_verified,
            given_name=(data.get("given_name") or "").strip(),
            family_name=(data.get("family_name") or "").strip(),
            name=(data.get("name") or "").strip(),
            picture=(data.get("picture") or "").strip() or None,
        )

    def _verify_as_access_token(self, token: str) -> GoogleIdentity | None:
        try:
            token_response = httpx.get(
                self.token_info_url,
                params={"access_token": token},
                timeout=10.0,
            )
            token_response.raise_for_status()
            token_data = token_response.json()
        except httpx.HTTPError as exc:
            detail = None
            if getattr(exc, "response", None) is not None:
                try:
                    detail = exc.response.text
                except Exception:
                    detail = None
            logger.info("Google access_token validation failed: %s", detail or str(exc))
            return None

        audience = token_data.get("aud") or token_data.get("issued_to") or token_data.get("audience")
        if audience not in settings.google_client_ids:
            logger.info("Google access_token audience mismatch: %s", audience)
            return None

        try:
            user_response = httpx.get(
                self.user_info_url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10.0,
            )
            user_response.raise_for_status()
            user_data = user_response.json()
        except httpx.HTTPError as exc:
            detail = None
            if getattr(exc, "response", None) is not None:
                try:
                    detail = exc.response.text
                except Exception:
                    detail = None
            logger.info("Google userinfo lookup failed: %s", detail or str(exc))
            return None

        email = (user_data.get("email") or "").strip().lower()
        sub = user_data.get("sub") or token_data.get("user_id") or ""
        email_verified = bool(user_data.get("email_verified"))

        if not email or not sub:
            logger.info("Google access_token missing email or sub")
            return None

        if not email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="La cuenta de Google debe tener el correo verificado.",
            )

        return GoogleIdentity(
            sub=sub,
            email=email,
            email_verified=email_verified,
            given_name=(user_data.get("given_name") or "").strip(),
            family_name=(user_data.get("family_name") or "").strip(),
            name=(user_data.get("name") or "").strip(),
            picture=(user_data.get("picture") or "").strip() or None,
        )

    def resolve_or_create_user(self, db: Session, identity: GoogleIdentity) -> Usuario:
        usuario = db.scalar(select(Usuario).where(Usuario.GoogleSub == identity.sub))
        if usuario:
            return self._sync_google_user(db, usuario, identity)

        usuario = db.scalar(select(Usuario).where(Usuario.Email == identity.email))
        if usuario:
            usuario.GoogleSub = identity.sub
            usuario.ProveedorAutenticacion = "google"
            if identity.picture and not usuario.FotoUrl:
                usuario.FotoUrl = identity.picture
            if not usuario.EmailConfirmado:
                usuario.EmailConfirmado = True
            db.commit()
            db.refresh(usuario)
            return usuario

        nombre, apellido = self._resolve_names(identity)
        usuario = Usuario(
            Nombre=nombre,
            Apellido=apellido,
            NombreUsuario=self._build_unique_username(db, identity),
            Email=identity.email,
            HashedPassword=hash_password(secrets.token_urlsafe(24)),
            GoogleSub=identity.sub,
            ProveedorAutenticacion="google",
            FotoUrl=identity.picture,
            Activo=True,
            EmailConfirmado=True,
        )
        db.add(usuario)
        db.commit()
        db.refresh(usuario)
        return usuario

    def _sync_google_user(self, db: Session, usuario: Usuario, identity: GoogleIdentity) -> Usuario:
        changed = False
        if usuario.Email != identity.email:
            usuario.Email = identity.email
            changed = True
        if usuario.ProveedorAutenticacion != "google":
            usuario.ProveedorAutenticacion = "google"
            changed = True
        if identity.picture and usuario.FotoUrl != identity.picture:
            usuario.FotoUrl = identity.picture
            changed = True
        if not usuario.EmailConfirmado:
            usuario.EmailConfirmado = True
            changed = True
        if changed:
            db.commit()
            db.refresh(usuario)
        return usuario

    def _resolve_names(self, identity: GoogleIdentity) -> tuple[str, str]:
        if identity.given_name and identity.family_name:
            return identity.given_name, identity.family_name

        if identity.name:
            parts = [part for part in identity.name.split() if part.strip()]
            if len(parts) == 1:
                return parts[0], "Google"
            if len(parts) > 1:
                return parts[0], " ".join(parts[1:])

        local_part = identity.email.split("@", 1)[0]
        return local_part, "Google"

    def _build_unique_username(self, db: Session, identity: GoogleIdentity) -> str:
        base = (
            identity.email.split("@", 1)[0]
            .strip()
            .lower()
            .replace(" ", "")
            .replace(".", "")
        )[:40] or "usuario"
        candidate = base
        suffix = 1

        while db.scalar(select(Usuario).where(Usuario.NombreUsuario == candidate)):
            candidate = f"{base}{suffix}"
            suffix += 1

        return candidate
