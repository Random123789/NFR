"""Account service package."""

from .router import ensure_account_schema, router

__all__ = ["ensure_account_schema", "router"]
