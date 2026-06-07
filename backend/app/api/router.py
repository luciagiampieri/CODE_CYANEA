from fastapi import APIRouter

from app.api.routes import root, trips, users


api_router = APIRouter()
api_router.include_router(root.router, tags=["root"])
api_router.include_router(trips.router, prefix="/trips", tags=["trips"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
