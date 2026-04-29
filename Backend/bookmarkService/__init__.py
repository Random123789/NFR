"""Bookmark service package."""

from .router import ensure_bookmark_tables, router

__all__ = ["ensure_bookmark_tables", "router"]
