from fastapi import APIRouter

router = APIRouter()

from app.api import health

# Register routers
router.include_router(health.router, tags=["health"])
