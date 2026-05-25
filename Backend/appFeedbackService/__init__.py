"""Application feedback service package."""

from .router import ensure_app_feedback_tables, router

__all__ = ["ensure_app_feedback_tables", "router"]
