"""
Database Connection & Session Pool Manager for MySQL 8.4
Provides context-managed pooled connections, transaction isolation helpers,
and session life-cycle handling for FastAPI endpoints.
"""

import os
import logging
from typing import Generator, Dict, Any, List, Optional
from contextlib import contextmanager

import mysql.connector
from mysql.connector import pooling
from mysql.connector.cursor import MySQLCursorDict

logger = logging.getLogger("memory_mirage.db")

# -----------------------------------------------------------------------------
# Configuration via Environment Variables
# -----------------------------------------------------------------------------
DB_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("MYSQL_PORT", "3306"))
DB_USER = os.getenv("MYSQL_USER", "root")
DB_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
DB_NAME = os.getenv("MYSQL_DATABASE", "memory_mirage_db")
POOL_SIZE = int(os.getenv("MYSQL_POOL_SIZE", "10"))

# -----------------------------------------------------------------------------
# Global Connection Pool Setup
# -----------------------------------------------------------------------------
_connection_pool: Optional[pooling.MySQLConnectionPool] = None


def init_db_pool() -> pooling.MySQLConnectionPool:
    """Initializes the thread-safe MySQL 8.4 connection pool."""
    global _connection_pool
    if _connection_pool is None:
        try:
            logger.info("Initializing MySQL connection pool to %s:%s/%s", DB_HOST, DB_PORT, DB_NAME)
            _connection_pool = pooling.MySQLConnectionPool(
                pool_name="memory_mirage_pool",
                pool_size=POOL_SIZE,
                pool_reset_session=True,
                host=DB_HOST,
                port=DB_PORT,
                user=DB_USER,
                password=DB_PASSWORD,
                database=DB_NAME,
                charset="utf8mb4",
                collation="utf8mb4_0900_ai_ci",
                autocommit=False,
                consume_results=True
            )
            logger.info("MySQL connection pool established successfully.")
        except mysql.connector.Error as err:
            logger.critical("Failed to connect to MySQL 8.4 instance: %s", err)
            raise err
    return _connection_pool


def get_db_pool() -> pooling.MySQLConnectionPool:
    """Retrieves or initializes the pool."""
    if _connection_pool is None:
        return init_db_pool()
    return _connection_pool


# -----------------------------------------------------------------------------
# Context Managers & FastAPI Dependency Providers
# -----------------------------------------------------------------------------
@contextmanager
def get_db_connection():
    """
    Context manager yielding a single connection checked out from the pool.
    Guarantees that the connection is closed (returned to pool) and rolled back
    if an unhandled exception occurred.
    """
    pool = get_db_pool()
    conn = pool.get_connection()
    try:
        yield conn
    except Exception as exc:
        conn.rollback()
        logger.error("Database transaction rolled back due to error: %s", exc)
        raise exc
    finally:
        conn.close()


def get_db():
    """
    FastAPI dependency injection provider.
    Yields a dictionary cursor for query execution with automatic transaction lifecycle.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor(dictionary=True)
        try:
            yield cursor
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cursor.close()


# -----------------------------------------------------------------------------
# Utility Query Execution Helpers
# -----------------------------------------------------------------------------
def execute_query(query: str, params: Optional[tuple] = None) -> List[Dict[str, Any]]:
    """Runs a read query returning a list of dict rows."""
    with get_db_connection() as conn:
        with conn.cursor(dictionary=True) as cursor:
            cursor.execute(query, params or ())
            return cursor.fetchall()


def execute_statement(query: str, params: Optional[tuple] = None) -> int:
    """Runs an INSERT/UPDATE/DELETE statement and commits, returning affected row count."""
    with get_db_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            conn.commit()
            return cursor.rowcount


def ping_database() -> bool:
    """Verifies that the database connection is alive and healthy."""
    try:
        rows = execute_query("SELECT 1 AS healthy")
        return bool(rows and rows[0].get("healthy") == 1)
    except Exception as e:
        logger.warning("Database ping failed: %s", e)
        return False