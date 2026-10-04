-- =============================================================================
-- MySQL Schema Migration: shortened_links
-- Description: Tracking table and indexes for internal media URL shortening layer.
-- Compatible with MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.3+
-- =============================================================================

CREATE TABLE IF NOT EXISTS `shortened_links` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `short_code` VARCHAR(10) NOT NULL,
    `long_url` TEXT NOT NULL,
    `source_platform` VARCHAR(30) NOT NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_shortened_links_code` (`short_code`),
    KEY `idx_shortened_links_source` (`source_platform`),
    KEY `idx_shortened_links_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Stored Procedure for Atomic Collision-Safe Upsert (MySQL)
DELIMITER //
CREATE PROCEDURE `register_shortened_media_link`(
    IN p_short_code VARCHAR(10),
    IN p_long_url TEXT,
    IN p_source_platform VARCHAR(30)
)
BEGIN
    INSERT INTO `shortened_links` (`short_code`, `long_url`, `source_platform`, `created_at`)
    VALUES (p_short_code, p_long_url, p_source_platform, NOW())
    ON DUPLICATE KEY UPDATE
        `long_url` = VALUES(`long_url`),
        `source_platform` = VALUES(`source_platform`);

    SELECT `id`, `short_code`, `long_url`, `source_platform`, `created_at`
    FROM `shortened_links`
    WHERE `short_code` = p_short_code
    LIMIT 1;
END //
DELIMITER ;
