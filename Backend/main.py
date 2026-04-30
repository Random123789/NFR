"""FastAPI main application."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from config import settings
from database import ping_database
from service_registry import SERVICES, register_services, startup_services

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="NFR Backend API",
    description="REST API for NFR (Non-Functional Requirements) management",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register service routers under /api to match the frontend client.
register_services(app)


@app.on_event("startup")
async def startup_bootstrap():
    await startup_services()


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    db_ok = await ping_database()
    
    return {
        "status": "ok" if db_ok else "error",
        "database": "connected" if db_ok else "disconnected",
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "NFR Backend API",
        "docs": "/docs",
        "version": "1.0.0",
        "services": [service.name for service in SERVICES],
    }


if __name__ == "__main__":
    import uvicorn
    
    logger.info("Backend PID: %s", os.getpid())
    logger.info("Starting server on %s:%s", settings.host, settings.port)
    logger.info("Database: %s:%s/%s", settings.db_host, settings.db_port, settings.db_name)
    logger.info("CORS Origins: %s", ", ".join(settings.cors_origins))
    
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=False,
        workers=1,
    )
