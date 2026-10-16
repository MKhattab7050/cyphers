-- ===================================
-- CYPHERS CHAT DATABASE SCHEMA
-- Complete Database Setup Script
-- ===================================

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS `final-db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `final-db`;

-- ===================================
-- 1. USERS TABLE
-- ===================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(255) NOT NULL UNIQUE,
  `email` VARCHAR(255) UNIQUE,
  `password` VARCHAR(255),
  `google_id` VARCHAR(255) UNIQUE,
  `name` VARCHAR(255),
  `avatar` TEXT,
  `online_status` TINYINT(1) DEFAULT 0,
  `display_name` VARCHAR(255),
  `avatar_url` TEXT,
  `bio` TEXT,
  `is_online` TINYINT(1) DEFAULT 0,
  `last_seen` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `status` VARCHAR(50) DEFAULT 'offline',
  `wallet_address` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (`username`),
  INDEX idx_email (`email`),
  INDEX idx_google_id (`google_id`),
  INDEX idx_is_online (`is_online`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================
-- 2. FILES TABLE
-- ===================================
CREATE TABLE IF NOT EXISTS `files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `filename` VARCHAR(255) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `file_path` TEXT NOT NULL,
  `file_size` BIGINT NOT NULL,
  `file_type` VARCHAR(50),
  `mime_type` VARCHAR(100),
  `duration` INT DEFAULT NULL COMMENT 'Duration in seconds for audio/video files',
  `username` VARCHAR(255) NOT NULL,
  `room` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (`username`),
  INDEX idx_room (`room`),
  INDEX idx_created_at (`created_at`),
  FOREIGN KEY (`username`) REFERENCES `users`(`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================
-- 3. MESSAGES TABLE
-- ===================================
CREATE TABLE IF NOT EXISTS `messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(255) NOT NULL,
  `room` VARCHAR(255) NOT NULL,
  `text` TEXT,
  `type` VARCHAR(50) DEFAULT 'text' COMMENT 'text, file, voice, image, video',
  `file_id` INT DEFAULT NULL,
  `replyTo` TEXT COMMENT 'JSON string of replied message',
  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `mediaUrl` TEXT,
  `mediaType` VARCHAR(50),
  `replyToUsername` VARCHAR(255),
  `replyToText` TEXT,
  `is_private` TINYINT(1) DEFAULT 0,
  `is_edited` TINYINT(1) DEFAULT 0,
  `is_deleted` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_username (`username`),
  INDEX idx_room (`room`),
  INDEX idx_timestamp (`timestamp`),
  INDEX idx_type (`type`),
  INDEX idx_is_private (`is_private`),
  INDEX idx_file_id (`file_id`),
  INDEX idx_room_timestamp (`room`, `timestamp`),
  FOREIGN KEY (`username`) REFERENCES `users`(`username`) ON DELETE CASCADE,
  FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================
-- 4. FRIEND_REQUESTS TABLE
-- ===================================
CREATE TABLE IF NOT EXISTS `friend_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `from_user` VARCHAR(255) NOT NULL,
  `to_user` VARCHAR(255) NOT NULL,
  `status` ENUM('pending', 'accepted', 'rejected', 'declined', 'expired') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_from_user (`from_user`),
  INDEX idx_to_user (`to_user`),
  INDEX idx_status (`status`),
  INDEX idx_created_at (`created_at`),
  UNIQUE KEY unique_request (`from_user`, `to_user`),
  FOREIGN KEY (`from_user`) REFERENCES `users`(`username`) ON DELETE CASCADE,
  FOREIGN KEY (`to_user`) REFERENCES `users`(`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================
-- 5. FRIENDS TABLE
-- ===================================
CREATE TABLE IF NOT EXISTS `friends` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user1` VARCHAR(255) NOT NULL,
  `user2` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user1 (`user1`),
  INDEX idx_user2 (`user2`),
  INDEX idx_created_at (`created_at`),
  UNIQUE KEY unique_friendship (`user1`, `user2`),
  FOREIGN KEY (`user1`) REFERENCES `users`(`username`) ON DELETE CASCADE,
  FOREIGN KEY (`user2`) REFERENCES `users`(`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================
-- 6. ROOMS TABLE (Optional - for future use)
-- ===================================
CREATE TABLE IF NOT EXISTS `rooms` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `room_name` VARCHAR(255) NOT NULL UNIQUE,
  `room_type` ENUM('public', 'private', 'group') DEFAULT 'public',
  `description` TEXT,
  `created_by` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_room_name (`room_name`),
  INDEX idx_room_type (`room_type`),
  INDEX idx_created_by (`created_by`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`username`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================
-- 7. WALLET_TRANSACTIONS TABLE (Optional)
-- ===================================
CREATE TABLE IF NOT EXISTS `wallet_transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(255) NOT NULL,
  `transaction_type` ENUM('send', 'receive', 'buy', 'sell') NOT NULL,
  `amount` DECIMAL(20, 8) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `to_address` VARCHAR(255),
  `from_address` VARCHAR(255),
  `tx_hash` VARCHAR(255),
  `status` ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_username (`username`),
  INDEX idx_tx_hash (`tx_hash`),
  INDEX idx_status (`status`),
  INDEX idx_created_at (`created_at`),
  FOREIGN KEY (`username`) REFERENCES `users`(`username`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===================================

-- Existing installations: run npm run db:migrate to add missing columns.

CREATE TABLE IF NOT EXISTS notifications (
 id INT AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 type VARCHAR(50) NOT NULL,
 content TEXT NOT NULL,
 related_id INT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
