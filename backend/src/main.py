from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import config
from .db.database import Database
from .db.seed import seed_api_keys, seed_skills
from .routers.generate import router as generate_router
from .routers.generate_app import router as generate_app_router
from .routers.models import router as models_router
from .routers.projects import router as projects_router
from .routers.screens import router as screens_router
from .routers.sessions import router as sessions_router
from .routers.settings import router as settings_router
from .routers.design_systems import router as design_systems_router
from .routers.skills import router as skills_router

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        getattr(logging, config.log_level.upper(), logging.INFO)
    ),
    logger_factory=structlog.PrintLoggerFactory(),
)

logger: structlog.BoundLogger = structlog.get_logger()

_db = Database(config.db_path)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    await _db.initialize()
    await seed_skills(_db.conn)
    await seed_api_keys(_db.conn)
    app.state.db = _db
    logger.info("app.started", host=config.host, port=config.port)
    yield
    await _db.close()
    logger.info("app.stopped")


app = FastAPI(title="OpenStitch API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(generate_router)
app.include_router(generate_app_router)
app.include_router(models_router, prefix="/api")
app.include_router(projects_router)
app.include_router(screens_router)
app.include_router(sessions_router)
app.include_router(settings_router, prefix="/api")
app.include_router(design_systems_router)
app.include_router(skills_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
