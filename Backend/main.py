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
    allow_origins=[settings.cors_origin, "http://localhost:5173", "http://localhost:5174", "http://127.0.0.1:5173", "http://127.0.0.1:5174"],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$" if settings.environment == "development" else None,
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
    
    logger.info(f"Backend PID: {os.getpid()}")
    logger.info(f"Starting server on {settings.host}:{settings.port}")
    logger.info(f"Database: {settings.db_host}:{settings.db_port}/{settings.db_name}")
    logger.info(f"CORS Origin: {settings.cors_origin}")
    
    uvicorn.run(
        app,
        host=settings.host,
        port=settings.port,
        reload=False,
        workers=1,
    )
