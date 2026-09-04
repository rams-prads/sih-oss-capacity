"""AI competency-building platform for India's Official Statistical System.

SIH 2026 - SIH26101 (MoSPI). Built to the Sunbird API contract that iGOT
Karmayogi runs on; the default configuration serves a local sandbox implementing
that contract, so the application makes no external calls.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import (
    admin,
    gaps,
    learning,
    mock_sunbird,
    onboarding,
    psychometrics,
    quiz,
    users,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="OSS Competency Platform",
    description=(
        "Competency-gap identification and personalised training for officers of "
        "India's Official Statistical System, aligned to the FRAC framework and the "
        "iGOT Karmayogi (Sunbird) catalogue."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = "/api"
app.include_router(users.router, prefix=api)
app.include_router(onboarding.router, prefix=api)
app.include_router(gaps.router, prefix=api)
app.include_router(quiz.router, prefix=api)
app.include_router(learning.router, prefix=api)
app.include_router(psychometrics.router, prefix=api)
app.include_router(admin.router, prefix=api)
# Sandbox that speaks the Sunbird contract over HTTP (see routers/mock_sunbird.py)
app.include_router(mock_sunbird.router)


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "karmayogi_mode": settings.karmayogi_mode,
        "llm_provider": settings.llm_provider,
    }
