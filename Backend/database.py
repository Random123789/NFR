"""Database connection and query helpers."""

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
        pool_name="nfr_pool",
        pool_size=5,
        pool_reset_session=True,
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
        raise_on_warnings=False,
        autocommit=True,
    )
    logger.info("Database connection pool created successfully")
except Exception as e:
    logger.exception("Failed to create database connection pool")
    db_pool = None


def get_connection():
    """Get a connection from the pool."""
    if not db_pool:
        raise Exception("Database connection pool not initialized")
    return db_pool.get_connection()


async def ping_database() -> bool:
    """Test database connectivity."""
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        conn.close()
        return True
    except Exception:
        logger.exception("Database ping failed")
        return False


async def execute_query(
    sql: str,
    params: Optional[List[Any]] = None,
    fetch_one: bool = False,
) -> Any:
    """
    Execute a SELECT query.
    
    Args:
        sql: SQL query string with %s placeholders
        params: Query parameters
        fetch_one: If True, return single row; if False, return all rows
    
    Returns:
        Single dict if fetch_one=True, list of dicts if fetch_one=False
    """
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        
        if fetch_one:
            result = cursor.fetchone()
            # Parse JSON history if present
            if result and "history" in result and result["history"]:
                try:
                    result["history"] = json.loads(result["history"])
                except (json.JSONDecodeError, TypeError):
                    result["history"] = []
            return result
        else:
            results = cursor.fetchall()
            # Parse JSON history for all results
            for row in results:
                if "history" in row and row["history"]:
                    try:
                        row["history"] = json.loads(row["history"])
                    except (json.JSONDecodeError, TypeError):
                        row["history"] = []
            return results
    finally:
        cursor.close()
        conn.close()


async def execute_mutation(
    sql: str,
    params: Optional[List[Any]] = None,
) -> int:
    """
    Execute INSERT, UPDATE, or DELETE query.
    
    Args:
        sql: SQL query string with %s placeholders
        params: Query parameters
    
    Returns:
        Number of affected rows or last insert ID
    """
    conn = get_connection()
    cursor = conn.cursor()
    
    try:
        if params:
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


def generate_record_id(prefix: str, table_name: str) -> str:
    """
    Generate a new record ID with prefix and sequence.
    
    Args:
        prefix: Record prefix (e.g., 'ACC', 'PRD', 'REC')
        table_name: Table name to query for last ID
    
    Returns:
        New record ID (e.g., 'ACC-005')
    """
    # This should be called synchronously from routes
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
