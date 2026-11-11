-- ============================================================================
-- Memory Mirage: Views, Triggers, and Stored Procedures
-- Target: MySQL 8.4
-- ============================================================================

USE memory_mirage_db;

DELIMITER $$

-- ----------------------------------------------------------------------------
-- 1. View: v_mitigation_summary
-- Replaces static CSV data/mitigation_summary.csv by computing aggregated
-- latency, reads, and duplication dynamically per scenario and strategy.
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_mitigation_summary $$
CREATE VIEW v_mitigation_summary AS
SELECT 
    r.scenario_id,
    s.name AS scenario_name,
    r.mitigation_strategy,
    COUNT(DISTINCT r.run_id) AS total_runs_recorded,
    ROUND(AVG(m.latency_ms), 4) AS avg_latency_ms,
    ROUND(MAX(m.latency_ms), 4) AS max_latency_ms,
    ROUND(AVG(m.duplication_rate) * 100, 2) AS avg_duplication_pct,
    ROUND(AVG(m.db_cache_hit_ratio) * 100, 2) AS avg_db_hit_pct,
    ROUND(AVG(m.os_cache_hit_ratio) * 100, 2) AS avg_os_hit_pct,
    MAX(m.cumulative_disk_reads) AS total_disk_reads,
    SUM(m.is_thrashing_step) AS total_thrashing_events
FROM simulation_runs r
JOIN scenarios s ON r.scenario_id = s.scenario_id
JOIN step_metrics m ON r.run_id = m.run_id
GROUP BY 
    r.scenario_id,
    s.name,
    r.mitigation_strategy $$

-- ----------------------------------------------------------------------------
-- 2. Trigger: trg_detect_thrashing
-- Evaluates step metrics AFTER INSERT; if duplication exceeds 40% while 
-- hit ratios plummet (disk hit indicates page fault), raises a system alert.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_detect_thrashing $$
CREATE TRIGGER trg_detect_thrashing
AFTER INSERT ON step_metrics
FOR EACH ROW
BEGIN
    -- Condition: High duplication with low local DBMS hit rate and a disk access
    IF (NEW.duplication_rate >= 0.40 AND NEW.hit_type = 'DISK_HIT') THEN
        INSERT INTO system_alerts (
            run_id,
            step_no,
            alert_level,
            message,
            trigger_metadata
        ) VALUES (
            NEW.run_id,
            NEW.step_no,
            'WARNING',
            CONCAT('Memory thrashing detected at step ', NEW.step_no, 
                   ': Duplication rate reached ', ROUND(NEW.duplication_rate * 100, 2), '%'),
            JSON_OBJECT(
                'page_id', NEW.page_id,
                'hit_type', NEW.hit_type,
                'duplication_rate', NEW.duplication_rate,
                'latency_ms', NEW.latency_ms
            )
        );
    END IF;
END $$

-- ----------------------------------------------------------------------------
-- 3. Stored Procedure: sp_execute_flash_purchase
-- Simulates an ACID transaction with Strict 2PL: acquires an Exclusive Lock
-- via `SELECT ... FOR UPDATE` on product stock, deducts balance, and writes
-- a WAL checkpoint record before committing.
-- ----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_execute_flash_purchase $$
CREATE PROCEDURE sp_execute_flash_purchase(
    IN p_user_id INT UNSIGNED,
    IN p_product_id INT UNSIGNED,
    IN p_quantity INT UNSIGNED,
    IN p_run_id INT UNSIGNED,
    OUT p_status_code VARCHAR(32),
    OUT p_message VARCHAR(255)
)
sp_block: BEGIN
    DECLARE v_current_stock INT UNSIGNED;
    DECLARE v_product_price DECIMAL(10, 2);
    DECLARE v_user_balance DECIMAL(12, 2);
    DECLARE v_total_cost DECIMAL(12, 2);
    DECLARE v_cylinder SMALLINT UNSIGNED;
    DECLARE v_tx_id VARCHAR(36);

    -- Standard error handler triggers ROLLBACK
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status_code = 'TX_FAILED';
        SET p_message = 'Database error encountered during flash sale checkout.';
    END;

    SET v_tx_id = UUID();

    START TRANSACTION;

    -- 1. WAL: Log transaction start
    INSERT INTO transaction_wal_logs (tx_id, page_id, record_type)
    VALUES (v_tx_id, p_product_id, 'BEGIN');

    -- 2. Strict 2PL: Exclusive Lock (X-Lock) on Target Flash Product
    SELECT stock, price, allocated_disk_track
      INTO v_current_stock, v_product_price, v_cylinder
      FROM flash_products
     WHERE product_id = p_product_id
       FOR UPDATE;

    IF v_current_stock IS NULL THEN
        ROLLBACK;
        SET p_status_code = 'PRODUCT_NOT_FOUND';
        SET p_message = 'Target product does not exist.';
        LEAVE sp_block;
    END IF;

    IF v_current_stock < p_quantity THEN
        -- WAL log transaction abort
        INSERT INTO transaction_wal_logs (tx_id, page_id, record_type)
        VALUES (v_tx_id, p_product_id, 'ABORT');
        ROLLBACK;
        SET p_status_code = 'OUT_OF_STOCK';
        SET p_message = CONCAT('Insufficient stock. Available: ', v_current_stock);
        LEAVE sp_block;
    END IF;

    -- 3. Exclusive Lock on User Account
    SELECT account_balance
      INTO v_user_balance
      FROM users
     WHERE user_id = p_user_id
       FOR UPDATE;

    IF v_user_balance IS NULL THEN
        ROLLBACK;
        SET p_status_code = 'USER_NOT_FOUND';
        SET p_message = 'Buyer account does not exist.';
        LEAVE sp_block;
    END IF;

    SET v_total_cost = v_product_price * p_quantity;

    IF v_user_balance < v_total_cost THEN
        INSERT INTO transaction_wal_logs (tx_id, page_id, record_type)
        VALUES (v_tx_id, p_product_id, 'ABORT');
        ROLLBACK;
        SET p_status_code = 'INSUFFICIENT_FUNDS';
        SET p_message = 'Buyer balance is inadequate for transaction.';
        LEAVE sp_block;
    END IF;

    -- 4. Deduct balances and inventory
    UPDATE flash_products
       SET stock = stock - p_quantity
     WHERE product_id = p_product_id;

    UPDATE users
       SET account_balance = account_balance - v_total_cost
     WHERE user_id = p_user_id;

    -- 5. Record Ternary Allocation
    INSERT INTO flash_sale_allocations (
        user_id, product_id, run_id, quantity_allocated, allocated_disk_cylinder
    ) VALUES (
        p_user_id, p_product_id, p_run_id, p_quantity, v_cylinder
    );

    -- 6. WAL: Log update delta & commit
    INSERT INTO transaction_wal_logs (
        tx_id, page_id, record_type, old_value, new_value, flushed_to_disk
    ) VALUES (
        v_tx_id, p_product_id, 'UPDATE',
        JSON_OBJECT('stock', v_current_stock, 'user_balance', v_user_balance),
        JSON_OBJECT('stock', v_current_stock - p_quantity, 'user_balance', v_user_balance - v_total_cost),
        1
    );

    INSERT INTO transaction_wal_logs (tx_id, page_id, record_type, flushed_to_disk)
    VALUES (v_tx_id, p_product_id, 'COMMIT', 1);

    COMMIT;

    SET p_status_code = 'SUCCESS';
    SET p_message = CONCAT('Flash order verified. Tx: ', v_tx_id);
END $$

-- ----------------------------------------------------------------------------
-- 4. Stored Procedure: sp_bulk_record_step_metrics
-- Accepts a structured JSON array of step metrics and persists them in batch.
-- ----------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_bulk_record_step_metrics $$
CREATE PROCEDURE sp_bulk_record_step_metrics(
    IN p_run_id INT UNSIGNED,
    IN p_steps_json JSON
)
BEGIN
    INSERT INTO step_metrics (
        run_id,
        step_no,
        page_id,
        operation,
        hit_type,
        latency_ms,
        db_cache_hit_ratio,
        os_cache_hit_ratio,
        duplication_rate,
        cumulative_disk_reads,
        is_thrashing_step
    )
    SELECT 
        p_run_id,
        jt.step_no,
        jt.page_id,
        jt.operation,
        jt.hit_type,
        jt.latency_ms,
        jt.db_cache_hit_ratio,
        jt.os_cache_hit_ratio,
        jt.duplication_rate,
        jt.cumulative_disk_reads,
        jt.is_thrashing_step
    FROM JSON_TABLE(
        p_steps_json,
        '$[*]' COLUMNS (
            step_no INT PATH '$.step_no',
            page_id INT PATH '$.page_id',
            operation VARCHAR(10) PATH '$.operation',
            hit_type VARCHAR(20) PATH '$.hit_type',
            latency_ms DECIMAL(8,4) PATH '$.latency_ms',
            db_cache_hit_ratio DECIMAL(5,4) PATH '$.db_cache_hit_ratio',
            os_cache_hit_ratio DECIMAL(5,4) PATH '$.os_cache_hit_ratio',
            duplication_rate DECIMAL(5,4) PATH '$.duplication_rate',
            cumulative_disk_reads INT PATH '$.cumulative_disk_reads',
            is_thrashing_step TINYINT(1) PATH '$.is_thrashing_step'
        )
    ) AS jt;
END $$

DELIMITER ;