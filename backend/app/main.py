from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.bootstrap import ensure_master_admin, initialize_database
from app.core.config import settings
from app.core.database import SessionLocal
from app import models  # noqa: F401


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_database()

    db = SessionLocal()
    try:
        ensure_master_admin(
            db,
            admin_name=settings.master_admin_name,
            admin_email=settings.master_admin_email,
            admin_password=settings.master_admin_password,
        )
    finally:
        db.close()

    yield


def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/", tags=["root"])
    def read_root() -> dict[str, str]:
        return {"message": "Silicon Mango Academy API is running"}

    application.mount("/uploads", StaticFiles(directory=settings.uploads_root), name="uploads")
    application.include_router(api_router, prefix=settings.api_v1_prefix)
    return application


app = create_application()
