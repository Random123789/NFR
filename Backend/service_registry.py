"""Backend service registration for the FastAPI app."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from typing import Awaitable, Callable, Optional

from fastapi import APIRouter, FastAPI

from accountService import router as account_router
from authService import ensure_default_user, router as auth_router
from bookmarkService import ensure_bookmark_tables, router as bookmark_router
from caseService import ensure_case_link_tables, router as case_router
from knockService import router as knock_router
from nfrService import router as nfr_router
from notificationsService import ensure_notification_tables, router as notification_router
from productService import router as product_router
from projectService import router as project_router
from reportsService import ensure_custom_report_tables, router as reports_router


StartupHook = Callable[[], Awaitable[None]]
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class BackendService:
    """A deployable API service mounted into the local FastAPI gateway."""

    name: str
    router: APIRouter
    startup: Optional[StartupHook] = None


SERVICES = [
    BackendService("authService", auth_router, ensure_default_user),
    BackendService("bookmarkService", bookmark_router, ensure_bookmark_tables),
    BackendService("accountService", account_router),
    BackendService("caseService", case_router, ensure_case_link_tables),
    BackendService("productService", product_router),
    BackendService("projectService", project_router),
    BackendService("nfrService", nfr_router),
    BackendService("knockService", knock_router),
    BackendService("reportsService", reports_router, ensure_custom_report_tables),
    BackendService("notificationsService", notification_router, ensure_notification_tables),
]


def register_services(app: FastAPI, api_prefix: str = "/api") -> None:
    """Mount all service routers under the API gateway prefix."""
    for service in SERVICES:
        app.include_router(service.router, prefix=api_prefix)


async def startup_services() -> None:
    """Run service-owned bootstrap hooks."""
    for service in SERVICES:
        if service.startup:
            try:
                await service.startup()
            except Exception as exc:
                logger.warning("Service bootstrap failed for %s: %s", service.name, exc)
