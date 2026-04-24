"""FastAPI main application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from config import settings
from database import ping_database
from routers import accounts, cases, products, projects, nfrs, knocks, reports, notifications
from auth import ensure_default_user, router as auth_router
from bookmarks import ensure_bookmark_tables, router as bookmarks_router

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

# Register routers under /api to match the frontend client.
app.include_router(accounts.router, prefix="/api")
app.include_router(cases.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(nfrs.router, prefix="/api")
app.include_router(knocks.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")

app.include_router(auth_router, prefix="/api")
app.include_router(bookmarks_router, prefix="/api")


@app.on_event("startup")
async def startup_bootstrap():
    await ensure_bookmark_tables()
    await ensure_default_user()


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
    }


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting server on {settings.host}:{settings.port}")
    logger.info(f"Database: {settings.db_host}:{settings.db_port}/{settings.db_name}")
    logger.info(f"CORS Origin: {settings.cors_origin}")
    
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
    )
