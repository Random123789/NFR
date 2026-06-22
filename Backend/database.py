"""Database connection and query helpers."""

from anyio import to_thread
import json
import mysql.connector
from mysql.connector import pooling
from typing import List, Dict, Any, Optional
from datetime import datetime
from config import settings
import logging

logger = logging.getLogger(__name__)

# Create connection pool
try:
    db_pool = pooling.MySQLConnectionPool(
        pool_name="crm_pool",
        pool_size=settings.db_pool_size,
        pool_reset_session=True,
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        raise_on_warnings=False,
        autocommit=True,
    )
    logger.info("Database connection pool created successfully with size %s", settings.db_pool_size)
except Exception as e:
    logger.exception("Failed to create database connection pool")
    db_pool = None


def get_connection():
    """Get a connection from the pool."""
    if not db_pool:
        raise Exception("Database connection pool not initialized")
    return db_pool.get_connection()


def _parse_history_field(row: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if row and "history" in row and row["history"]:
        try:
            row["history"] = json.loads(row["history"])
        except (json.JSONDecodeError, TypeError):
            row["history"] = []
    return row


def _ping_database_sync() -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT 1")
        cursor.fetchone()
        return True
    finally:
        cursor.close()
        conn.close()


async def ping_database() -> bool:
    """Test database connectivity without blocking the event loop."""
    try:
        return await to_thread.run_sync(_ping_database_sync)
    except Exception:
        logger.exception("Database ping failed")
        return False


def _execute_query_sync(
    sql: str,
    params: Optional[List[Any]] = None,
    fetch_one: bool = False,
) -> Any:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        if params is not None:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        
        if fetch_one:
            result = cursor.fetchone()
            return _parse_history_field(result)

        results = cursor.fetchall()
        for row in results:
            _parse_history_field(row)
        return results
    finally:
        cursor.close()
        conn.close()


async def execute_query(
    sql: str,
    params: Optional[List[Any]] = None,
    fetch_one: bool = False,
) -> Any:
    """
    Execute a SELECT query without blocking the event loop.
    
    Args:
        sql: SQL query string with %s placeholders
        params: Query parameters
        fetch_one: If True, return single row; if False, return all rows
    
    Returns:
        Single dict if fetch_one=True, list of dicts if fetch_one=False
    """
    return await to_thread.run_sync(_execute_query_sync, sql, params, fetch_one)


def _execute_mutation_sync(
    sql: str,
    params: Optional[List[Any]] = None,
) -> int:
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        if params is not None:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        
        conn.commit()
        return cursor.lastrowid or cursor.rowcount
    except Exception:
        conn.rollback()
        logger.exception("Mutation failed")
        raise
    finally:
        cursor.close()
        conn.close()


async def execute_mutation(
    sql: str,
    params: Optional[List[Any]] = None,
) -> int:
    """
    Execute INSERT, UPDATE, or DELETE query without blocking the event loop.
    
    Args:
        sql: SQL query string with %s placeholders
        params: Query parameters
    
    Returns:
        Number of affected rows or last insert ID
    """
    return await to_thread.run_sync(_execute_mutation_sync, sql, params)


def serialize_history(history: List[Dict[str, Any]]) -> str:
    """Serialize history list to JSON string."""
    return json.dumps(history) if history else None


def deserialize_history(history_str: Optional[str]) -> List[Dict[str, Any]]:
    """Deserialize history JSON string to list."""
    if not history_str:
        return []
    try:
        return json.loads(history_str)
    except (json.JSONDecodeError, TypeError):
        return []


def _generate_record_id_sync(prefix: str, table_name: str) -> str:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute(
            f"SELECT MAX(CAST(SUBSTRING(recordId, {len(prefix)+2}) AS UNSIGNED)) as max_id FROM {table_name}"
        )
        result = cursor.fetchone()
        max_id = result.get("max_id", 0) if result else 0
        next_id = (max_id or 0) + 1
        return f"{prefix}-{next_id:03d}"
    finally:
        cursor.close()
        conn.close()


async def generate_record_id(prefix: str, table_name: str) -> str:
    """
    Generate a new record ID with prefix and sequence without blocking the event loop.
    
    Args:
        prefix: Record prefix (e.g., 'ACC', 'PRD', 'REC')
        table_name: Table name to query for last ID
    
    Returns:
        New record ID (e.g., 'ACC-005')
    """
    return await to_thread.run_sync(_generate_record_id_sync, prefix, table_name)
