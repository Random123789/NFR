CREATE DATABASE IF NOT EXISTS crm;
USE crm;

CREATE TABLE IF NOT EXISTS accounts (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-ACCOUNT',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL,
  updatedBy VARCHAR(120) DEFAULT 'System',
  accountName VARCHAR(255) NOT NULL,
  website VARCHAR(255),
  type VARCHAR(120),
  vertical VARCHAR(120),
  history JSON
);

CREATE TABLE IF NOT EXISTS products (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-PRODUCT',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL,
  updatedBy VARCHAR(120) DEFAULT 'System',
  productFamily VARCHAR(120),
  productName VARCHAR(255) NOT NULL,
  productVersion VARCHAR(120),
  productUrl VARCHAR(255),
  description TEXT,
  history JSON
);

CREATE TABLE IF NOT EXISTS projects (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-PROJECT',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL,
  updatedBy VARCHAR(120) DEFAULT 'System',
  projectName VARCHAR(255) NOT NULL,
  accountId VARCHAR(32),
  startDate VARCHAR(32),
  closeDate VARCHAR(32),
  seOwner VARCHAR(120),
  isClosed TINYINT(1) NOT NULL DEFAULT 0,
  stage VARCHAR(120),
  sfdc VARCHAR(120),
  sfdcValue BIGINT,
  history JSON
);

CREATE TABLE IF NOT EXISTS mantis (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-MANTIS',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL,
  updatedBy VARCHAR(120) DEFAULT 'System',
  description TEXT NOT NULL,
  mantisId VARCHAR(120),
  mantisUrl VARCHAR(255),
  category VARCHAR(120),
  mantisStatus VARCHAR(120),
  mantisRequestDate VARCHAR(32),
  mantisTargetDate VARCHAR(32),
  history JSON
);

CREATE UNIQUE INDEX uniq_mantis_mantisId ON mantis (mantisId);

CREATE TABLE IF NOT EXISTS knocks (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-KNOCK',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL,
  updatedBy VARCHAR(120) DEFAULT 'System',
  description TEXT NOT NULL,
  knockId VARCHAR(120),
  knockUrl VARCHAR(255),
  status VARCHAR(120),
  requestDate VARCHAR(32),
  targetDate VARCHAR(32),
  history JSON
);

CREATE UNIQUE INDEX uniq_knocks_knockId ON knocks (knockId);

CREATE TABLE IF NOT EXISTS cases (
  recordId VARCHAR(32) PRIMARY KEY,
  project VARCHAR(32),
  category VARCHAR(120),
  escalationType VARCHAR(120),
  escalationNote TEXT,
  closeDate VARCHAR(32),
  description TEXT NOT NULL,
  seOwner VARCHAR(120),
  assignedTo VARCHAR(120),
  priority VARCHAR(120),
  status VARCHAR(120),
  history JSON
);

CREATE INDEX idx_cases_project ON cases (project);
CREATE INDEX idx_cases_seOwner ON cases (seOwner);
CREATE INDEX idx_cases_assignedTo ON cases (assignedTo);
CREATE INDEX idx_projects_accountId ON projects (accountId);

ALTER TABLE projects
  ADD CONSTRAINT fk_projects_account
  FOREIGN KEY (accountId) REFERENCES accounts(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE cases
  ADD CONSTRAINT fk_cases_project
  FOREIGN KEY (project) REFERENCES projects(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS case_entity_links (
  caseRecordId VARCHAR(32) NOT NULL,
  entityType VARCHAR(16) NOT NULL,
  entityRecordId VARCHAR(32) NOT NULL,
  createdAt DATETIME NOT NULL,
  createdBy VARCHAR(120),
  PRIMARY KEY (caseRecordId, entityType, entityRecordId),
  CONSTRAINT fk_case_entity_links_case
    FOREIGN KEY (caseRecordId) REFERENCES cases(recordId)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX idx_case_entity_links_case ON case_entity_links (caseRecordId);
CREATE INDEX idx_case_entity_links_entity ON case_entity_links (entityType, entityRecordId);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  displayName VARCHAR(120) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'user',
  vertical VARCHAR(120),
  passwordHash VARCHAR(255) NOT NULL,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  lastLoginAt DATETIME NULL
);

CREATE TABLE IF NOT EXISTS case_watchers (
  caseRecordId VARCHAR(32) NOT NULL,
  userId INT NULL,
  displayName VARCHAR(120) NOT NULL,
  watchedAt DATETIME NOT NULL,
  watchedBy VARCHAR(120),
  PRIMARY KEY (caseRecordId, displayName),
  INDEX idx_case_watchers_case (caseRecordId),
  INDEX idx_case_watchers_userId (userId),
  FOREIGN KEY (caseRecordId) REFERENCES cases(recordId) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS case_watcher_opt_outs (
  caseRecordId VARCHAR(32) NOT NULL,
  displayName VARCHAR(120) NOT NULL,
  optedOutAt DATETIME NOT NULL,
  optedOutBy VARCHAR(120),
  PRIMARY KEY (caseRecordId, displayName),
  INDEX idx_case_watcher_opt_outs_case (caseRecordId),
  FOREIGN KEY (caseRecordId) REFERENCES cases(recordId) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  tokenHash VARCHAR(128) NOT NULL UNIQUE,
  expiresAt DATETIME NOT NULL,
  createdAt DATETIME NOT NULL,
  INDEX idx_user_sessions_userId (userId),
  INDEX idx_user_sessions_expiresAt (expiresAt),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_bookmarks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  entityType VARCHAR(32) NOT NULL,
  entityId VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) NULL,
  createdAt DATETIME NOT NULL,
  UNIQUE KEY uniq_user_bookmark (userId, entityType, entityId),
  INDEX idx_user_bookmarks_userId (userId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_record_read_state (
  userId INT PRIMARY KEY,
  baselineAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_record_reads (
  userId INT NOT NULL,
  entityType VARCHAR(32) NOT NULL,
  entityId VARCHAR(64) NOT NULL,
  lastSeenAt DATETIME NOT NULL,
  PRIMARY KEY (userId, entityType, entityId),
  INDEX idx_user_record_reads_userId (userId),
  INDEX idx_user_record_reads_entity (entityType, entityId),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  userId INT NULL,
  userEmail VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  entityType VARCHAR(64) NOT NULL,
  entityId VARCHAR(120) NOT NULL,
  details JSON NULL,
  createdAt DATETIME NOT NULL,
  INDEX idx_audit_logs_createdAt (createdAt),
  INDEX idx_audit_logs_entity (entityType, entityId),
  INDEX idx_audit_logs_userId (userId)
);

CREATE TABLE IF NOT EXISTS app_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(32) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  createdByUserId INT NULL,
  createdByName VARCHAR(120) NOT NULL,
  createdByEmail VARCHAR(255) NOT NULL,
  createdAt DATETIME NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  doneAt DATETIME NULL,
  doneByUserId INT NULL,
  doneByName VARCHAR(120) NULL,
  INDEX idx_app_feedback_createdAt (createdAt),
  INDEX idx_app_feedback_category (category),
  INDEX idx_app_feedback_status (status),
  INDEX idx_app_feedback_createdByUserId (createdByUserId),
  FOREIGN KEY (createdByUserId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (doneByUserId) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_feedback_images (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  feedbackId BIGINT NOT NULL,
  fileName VARCHAR(255) NOT NULL,
  contentType VARCHAR(120) NOT NULL,
  fileSize INT NOT NULL,
  imageData LONGBLOB NOT NULL,
  createdAt DATETIME NOT NULL,
  INDEX idx_app_feedback_images_feedbackId (feedbackId),
  FOREIGN KEY (feedbackId) REFERENCES app_feedback(id) ON DELETE CASCADE
);
