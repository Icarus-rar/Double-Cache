-- ============================================================================
-- Memory Mirage: MySQL 8.4 Relational Telemetry & E-Commerce Schema
-- Target: MySQL 8.4 (InnoDB Default Engine, utf8mb4)
-- Normalization: 3NF / BCNF decomposed entities + Weak Entity step_metrics
-- ============================================================================

CREATE DATABASE IF NOT EXISTS memory_mirage_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE memory_mirage_db;

-- Clean existing schema if re-running
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS system_alerts;
DROP TABLE IF EXISTS transaction_wal_logs;
DROP TABLE IF EXISTS step_metrics;
DROP TABLE IF EXISTS flash_sale_allocations;
DROP TABLE IF EXISTS flash_products;
DROP TABLE IF EXISTS simulation_runs;
DROP TABLE IF EXISTS scenarios;
DROP TABLE IF EXISTS os_access_matrix;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ----------------------------------------------------------------------------
-- 1. Users Table (Strong Entity)
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    user_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(64) NOT NULL,
    email VARCHAR(128) NOT NULL,
    user_tier ENUM('STANDARD', 'VIP', 'SYSTEM_ADMIN') NOT NULL DEFAULT 'STANDARD',
    account_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_users PRIMARY KEY (user_id),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_user_balance CHECK (account_balance >= 0.00)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 2. Flash Products Table (Strong Entity)
-- Represents products subjected to high-temporal-locality traffic.
-- ----------------------------------------------------------------------------
CREATE TABLE flash_products (
    product_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    sku VARCHAR(32) NOT NULL,
    product_name VARCHAR(128) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock INT UNSIGNED NOT NULL,
    initial_stock INT UNSIGNED NOT NULL,
    allocated_disk_track SMALLINT UNSIGNED NOT NULL, -- OS Disk Cylinder (0-199)
    status ENUM('ACTIVE', 'SOLDOUT', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT pk_flash_products PRIMARY KEY (product_id),
    CONSTRAINT uq_flash_products_sku UNIQUE (sku),
    CONSTRAINT chk_flash_products_track CHECK (allocated_disk_track BETWEEN 0 AND 199),
    CONSTRAINT chk_flash_products_price CHECK (price > 0.00)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 3. Scenarios Table (Strong Entity)
-- ----------------------------------------------------------------------------
CREATE TABLE scenarios (
    scenario_id VARCHAR(32) NOT NULL, -- e.g., 'scenario1', 'scenario2', 'scenario3'
    name VARCHAR(128) NOT NULL,
    workload_type ENUM('ZIPFIAN_HOTSPOT', 'SEQUENTIAL_SCAN', 'MIXED_CONCURRENCY') NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_scenarios PRIMARY KEY (scenario_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 4. Simulation Runs Table (Strong Entity)
-- Includes a JSON column for comparing relational queries with NoSQL-style doc lookups.
-- ----------------------------------------------------------------------------
CREATE TABLE simulation_runs (
    run_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    scenario_id VARCHAR(32) NOT NULL,
    mitigation_strategy ENUM('DOUBLE_CACHING', 'O_DIRECT', 'COORDINATED') NOT NULL,
    page_replacement_policy ENUM('LRU', 'LFU', 'FIFO', 'OPTIMAL', 'CLOCK') NOT NULL DEFAULT 'LRU',
    db_cache_size_pages INT UNSIGNED NOT NULL DEFAULT 50,
    os_cache_size_pages INT UNSIGNED NOT NULL DEFAULT 50,
    total_steps INT UNSIGNED NOT NULL DEFAULT 1000,
    total_execution_time_ms DECIMAL(10, 3) NULL,
    workload_config JSON NOT NULL, -- Stores dynamic parameters (read_ratio, skew, etc.)
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_simulation_runs PRIMARY KEY (run_id),
    CONSTRAINT fk_simulation_runs_scenario FOREIGN KEY (scenario_id)
        REFERENCES scenarios (scenario_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_cache_sizes CHECK (db_cache_size_pages > 0 AND os_cache_size_pages > 0)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 5. Step Metrics Table (Weak Entity)
-- Keyed identifyingly by (run_id, step_no). Stores per-step telemetry.
-- ----------------------------------------------------------------------------
CREATE TABLE step_metrics (
    run_id INT UNSIGNED NOT NULL,
    step_no INT UNSIGNED NOT NULL,
    page_id INT UNSIGNED NOT NULL,
    operation ENUM('READ', 'WRITE') NOT NULL,
    hit_type ENUM('DB_HIT', 'OS_HIT', 'DISK_HIT') NOT NULL,
    latency_ms DECIMAL(8, 4) NOT NULL,
    db_cache_hit_ratio DECIMAL(5, 4) NOT NULL,
    os_cache_hit_ratio DECIMAL(5, 4) NOT NULL,
    duplication_rate DECIMAL(5, 4) NOT NULL,
    cumulative_disk_reads INT UNSIGNED NOT NULL,
    is_thrashing_step TINYINT(1) NOT NULL DEFAULT 0,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_step_metrics PRIMARY KEY (run_id, step_no),
    CONSTRAINT fk_step_metrics_run FOREIGN KEY (run_id)
        REFERENCES simulation_runs (run_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT chk_ratios CHECK (
        db_cache_hit_ratio BETWEEN 0.0000 AND 1.0000 AND
        os_cache_hit_ratio BETWEEN 0.0000 AND 1.0000 AND
        duplication_rate BETWEEN 0.0000 AND 1.0000
    )
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 6. Flash Sale Allocations (Ternary Relationship: Degree 3)
-- Correlates User, Flash Product, and the Simulation Run that reserved it.
-- ----------------------------------------------------------------------------
CREATE TABLE flash_sale_allocations (
    allocation_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    run_id INT UNSIGNED NOT NULL,
    quantity_allocated INT UNSIGNED NOT NULL DEFAULT 1,
    allocated_disk_cylinder SMALLINT UNSIGNED NOT NULL,
    allocated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_allocations PRIMARY KEY (allocation_id),
    CONSTRAINT fk_alloc_user FOREIGN KEY (user_id)
        REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_alloc_product FOREIGN KEY (product_id)
        REFERENCES flash_products (product_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_alloc_run FOREIGN KEY (run_id)
        REFERENCES simulation_runs (run_id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_alloc_qty CHECK (quantity_allocated > 0)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 7. Transaction Write-Ahead Log (WAL) Records
-- Replicates DBMS Unit 5 / ARIES Crash Recovery state in SQL.
-- ----------------------------------------------------------------------------
CREATE TABLE transaction_wal_logs (
    lsn BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, -- Log Sequence Number
    tx_id VARCHAR(36) NOT NULL,
    page_id INT UNSIGNED NOT NULL,
    prev_lsn BIGINT UNSIGNED NOT NULL DEFAULT 0,
    record_type ENUM('BEGIN', 'UPDATE', 'COMMIT', 'ABORT', 'CHECKPOINT') NOT NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    flushed_to_disk TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_wal_lsn PRIMARY KEY (lsn),
    INDEX idx_wal_tx (tx_id),
    INDEX idx_wal_page (page_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 8. OS Protection Access Matrix Table
-- Enforces domain-specific access rights (READ, WRITE, DIRECT_IO, FLUSH).
-- ----------------------------------------------------------------------------
CREATE TABLE os_access_matrix (
    domain_name ENUM('USER_APP', 'DBMS_ENGINE', 'OS_KERNEL') NOT NULL,
    object_type ENUM('BUFFER_POOL', 'PAGE_CACHE', 'WAL_LOG', 'DISK_RAW_BLOCK') NOT NULL,
    can_read TINYINT(1) NOT NULL DEFAULT 0,
    can_write TINYINT(1) NOT NULL DEFAULT 0,
    can_direct_io TINYINT(1) NOT NULL DEFAULT 0,
    can_flush TINYINT(1) NOT NULL DEFAULT 0,
    CONSTRAINT pk_access_matrix PRIMARY KEY (domain_name, object_type)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 9. System Alerts Table (Target for Triggers)
-- ----------------------------------------------------------------------------
CREATE TABLE system_alerts (
    alert_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    run_id INT UNSIGNED NOT NULL,
    step_no INT UNSIGNED NOT NULL,
    alert_level ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL,
    message VARCHAR(255) NOT NULL,
    trigger_metadata JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_system_alerts PRIMARY KEY (alert_id),
    CONSTRAINT fk_alerts_run FOREIGN KEY (run_id)
        REFERENCES simulation_runs (run_id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- 10. B+Tree Secondary Indexes
-- Designed for query acceleration and EXPLAIN ANALYZE evaluation.
-- ----------------------------------------------------------------------------
CREATE INDEX idx_run_scenario_strat ON simulation_runs (scenario_id, mitigation_strategy);
CREATE INDEX idx_step_run_hit ON step_metrics (run_id, hit_type);
CREATE INDEX idx_step_page ON step_metrics (page_id);
CREATE INDEX idx_products_track ON flash_products (allocated_disk_track);

-- Pre-seed default Scenario metadata
INSERT INTO scenarios (scenario_id, name, workload_type, description) VALUES
('scenario1', 'Hot-spot Flash Sale', 'ZIPFIAN_HOTSPOT', 'High-skew temporal locality: concurrent buyers read/write identical product pages.'),
('scenario2', 'Sequential Analytical Flood', 'SEQUENTIAL_SCAN', 'Sequential table scan thrashing the buffer pool and evicting hot sale pages.'),
('scenario3', 'Mixed Concurrency & 2PL Contention', 'MIXED_CONCURRENCY', 'High write contention, lock conflicts, and simulated crash points.');

-- Seed OS Access Matrix Rules
INSERT INTO os_access_matrix (domain_name, object_type, can_read, can_write, can_direct_io, can_flush) VALUES
('USER_APP', 'BUFFER_POOL', 1, 0, 0, 0),
('USER_APP', 'PAGE_CACHE', 0, 0, 0, 0),
('USER_APP', 'WAL_LOG', 0, 0, 0, 0),
('USER_APP', 'DISK_RAW_BLOCK', 0, 0, 0, 0),
('DBMS_ENGINE', 'BUFFER_POOL', 1, 1, 1, 1),
('DBMS_ENGINE', 'PAGE_CACHE', 1, 1, 0, 1),
('DBMS_ENGINE', 'WAL_LOG', 1, 1, 1, 1),
('DBMS_ENGINE', 'DISK_RAW_BLOCK', 0, 0, 1, 0),
('OS_KERNEL', 'BUFFER_POOL', 0, 0, 0, 0),
('OS_KERNEL', 'PAGE_CACHE', 1, 1, 0, 1),
('OS_KERNEL', 'WAL_LOG', 1, 1, 0, 1),
('OS_KERNEL', 'DISK_RAW_BLOCK', 1, 1, 0, 1);