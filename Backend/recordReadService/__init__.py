"""Per-user record read-state service package."""

from .router import ensure_record_read_tables, router

__all__ = ["ensure_record_read_tables", "router"]
