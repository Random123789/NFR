CREATE DATABASE IF NOT EXISTS nfr;
USE nfr;

CREATE TABLE IF NOT EXISTS accounts (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-ACCOUNT',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedBy VARCHAR(120) DEFAULT 'System',
  productFamily VARCHAR(120),
  productName VARCHAR(255) NOT NULL,
  productUrl VARCHAR(255),
  history JSON
);

CREATE TABLE IF NOT EXISTS projects (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-PROJECT',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedBy VARCHAR(120) DEFAULT 'System',
  projectName VARCHAR(255) NOT NULL,
  accountId VARCHAR(32),
  startDate VARCHAR(32),
  closeDate VARCHAR(32),
  stage VARCHAR(120),
  sfdc VARCHAR(120),
  sfdcValue VARCHAR(120),
  se VARCHAR(120),
  history JSON
);

CREATE TABLE IF NOT EXISTS nfrs (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-NFR',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedBy VARCHAR(120) DEFAULT 'System',
  description TEXT NOT NULL,
  mantisId VARCHAR(120),
  mantisUrl VARCHAR(255),
  nfrStatus VARCHAR(120),
  nfrRequestDate VARCHAR(32),
  nfrTargetDate VARCHAR(32),
  history JSON
);

CREATE UNIQUE INDEX uniq_nfrs_mantisId ON nfrs (mantisId);

CREATE TABLE IF NOT EXISTS knocks (
  recordId VARCHAR(32) PRIMARY KEY,
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-KNOCK',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
  moduleId VARCHAR(32) NOT NULL DEFAULT 'MOD-CASE',
  recordRevision VARCHAR(16) NOT NULL DEFAULT '1.0',
  metaData VARCHAR(255),
  ownedBy VARCHAR(120),
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdBy VARCHAR(120) DEFAULT 'System',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updatedBy VARCHAR(120) DEFAULT 'System',
  description TEXT NOT NULL,
  previousStatus VARCHAR(120),
  closeDate VARCHAR(32),
  status VARCHAR(120),
  priority VARCHAR(120),
  category VARCHAR(120),
  caseOwner VARCHAR(120),
  product VARCHAR(32),
  account VARCHAR(32),
  project VARCHAR(32),
  nfrRecordId VARCHAR(32),
  knockRecordId VARCHAR(32),
  knockId VARCHAR(120),
  mantisId VARCHAR(120),
  escalationNote TEXT,
  escalationType VARCHAR(120),
  seOwner VARCHAR(120),
  history JSON
);

CREATE INDEX idx_cases_account ON cases (account);
CREATE INDEX idx_cases_product ON cases (product);
CREATE INDEX idx_cases_project ON cases (project);
CREATE INDEX idx_cases_nfrRecordId ON cases (nfrRecordId);
CREATE INDEX idx_cases_knockRecordId ON cases (knockRecordId);
CREATE INDEX idx_cases_mantisId ON cases (mantisId);
CREATE INDEX idx_cases_knockId ON cases (knockId);
CREATE INDEX idx_projects_accountId ON projects (accountId);

ALTER TABLE projects
  ADD CONSTRAINT fk_projects_account
  FOREIGN KEY (accountId) REFERENCES accounts(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE cases
  ADD CONSTRAINT fk_cases_account
  FOREIGN KEY (account) REFERENCES accounts(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE cases
  ADD CONSTRAINT fk_cases_product
  FOREIGN KEY (product) REFERENCES products(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE cases
  ADD CONSTRAINT fk_cases_project
  FOREIGN KEY (project) REFERENCES projects(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE cases
  ADD CONSTRAINT fk_cases_nfr
  FOREIGN KEY (nfrRecordId) REFERENCES nfrs(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE cases
  ADD CONSTRAINT fk_cases_knock
  FOREIGN KEY (knockRecordId) REFERENCES knocks(recordId)
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS case_entity_links (
  caseRecordId VARCHAR(32) NOT NULL,
  entityType VARCHAR(16) NOT NULL,
  entityRecordId VARCHAR(32) NOT NULL,
  createdAt DATETIME NOT NULL,
  createdBy VARCHAR(120),
  PRIMARY KEY (caseRecordId, entityType, entityRecordId)
);

CREATE INDEX idx_case_entity_links_case ON case_entity_links (caseRecordId);
CREATE INDEX idx_case_entity_links_entity ON case_entity_links (entityType, entityRecordId);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  displayName VARCHAR(120) NOT NULL,
  role VARCHAR(64) NOT NULL DEFAULT 'user',
  passwordHash VARCHAR(255) NOT NULL,
  isActive TINYINT(1) NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL,
  updatedAt DATETIME NOT NULL,
  lastLoginAt DATETIME NULL
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
