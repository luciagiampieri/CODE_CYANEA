from fastapi import APIRouter


router = APIRouter()


@router.get("/")
def api_root() -> dict[str, str]:
    return {"name": "Cyanea API", "version": "0.1.0"}
