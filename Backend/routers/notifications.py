"""Compatibility wrapper for the Python notifications service."""

from notificationsService import ensure_notification_tables, router

__all__ = ["ensure_notification_tables", "router"]
