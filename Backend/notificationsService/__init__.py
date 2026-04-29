"""Notifications service package."""

from .router import ensure_notification_tables, router

__all__ = ["ensure_notification_tables", "router"]
