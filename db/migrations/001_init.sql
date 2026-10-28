-- Initial schema. IDs are UUID strings (CHAR(36)). Human-readable codes (TC-APP-0001)
-- come from per-project counters, NOT AUTO_INCREMENT (TiDB allocates auto-ids in batches).
-- Historical tables (executions, run cases) use ON DELETE RESTRICT; entities are archived, not deleted.

CREATE TABLE users (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  email         VARCHAR(191) NOT NULL,
  name          VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('ADMIN','QA_LEAD','QA_ENGINEER','VIEWER') NOT NULL DEFAULT 'QA_ENGINEER',
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE projects (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  `key`       VARCHAR(10)  NOT NULL,
  name        VARCHAR(191) NOT NULL,
  description TEXT NULL,
  status      ENUM('ACTIVE','ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
  owner_id    CHAR(36)     NOT NULL,
  tc_seq      INT NOT NULL DEFAULT 0,
  run_seq     INT NOT NULL DEFAULT 0,
  defect_seq  INT NOT NULL DEFAULT 0,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_projects_key (`key`),
  KEY ix_projects_status (status),
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE project_members (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  role       ENUM('QA_LEAD','QA_ENGINEER','VIEWER') NOT NULL DEFAULT 'QA_ENGINEER',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pm_project_user (project_id, user_id),
  KEY ix_pm_user (user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE RESTRICT
);

CREATE TABLE test_cases (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  project_id      CHAR(36)     NOT NULL,
  seq             INT          NOT NULL,
  code            VARCHAR(40)  NOT NULL,
  title           VARCHAR(255) NOT NULL,
  description     TEXT NULL,
  preconditions   TEXT NULL,
  test_data       TEXT NULL,
  priority        ENUM('CRITICAL','HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
  type            ENUM('FUNCTIONAL','REGRESSION','SMOKE','INTEGRATION','API','UI','PERFORMANCE','SECURITY') NOT NULL DEFAULT 'FUNCTIONAL',
  automation      ENUM('MANUAL','AUTOMATED','TO_BE_AUTOMATED') NOT NULL DEFAULT 'MANUAL',
  component       VARCHAR(191) NULL,
  tags            JSON NULL,
  requirement_url VARCHAR(500) NULL,
  defect_urls     JSON NULL,
  author_id       CHAR(36)     NOT NULL,
  assignee_id     CHAR(36)     NULL,
  current_version INT          NOT NULL DEFAULT 1,
  archived_at     DATETIME(3)  NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tc_project_seq (project_id, seq),
  UNIQUE KEY uq_tc_code (code),
  KEY ix_tc_filters (project_id, archived_at, priority, type, automation),
  KEY ix_tc_title (project_id, title),
  KEY ix_tc_assignee (assignee_id),
  CONSTRAINT fk_tc_project  FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tc_author   FOREIGN KEY (author_id)   REFERENCES users(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_tc_assignee FOREIGN KEY (assignee_id) REFERENCES users(id)    ON DELETE SET NULL
);

CREATE TABLE test_case_steps (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  test_case_id CHAR(36) NOT NULL,
  position     INT      NOT NULL,
  action       TEXT     NOT NULL,
  test_data    TEXT NULL,
  expected     TEXT     NOT NULL,
  UNIQUE KEY uq_tcs_pos (test_case_id, position),
  CONSTRAINT fk_tcs_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
);

-- Immutable snapshot of a test case at a point in time (full content incl. steps as JSON).
CREATE TABLE test_case_versions (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  test_case_id CHAR(36) NOT NULL,
  version      INT      NOT NULL,
  snapshot     JSON     NOT NULL,
  change_note  VARCHAR(500) NULL,
  created_by   CHAR(36) NOT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_tcv (test_case_id, version),
  CONSTRAINT fk_tcv_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tcv_user FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE RESTRICT
);

CREATE TABLE test_suites (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  project_id  CHAR(36)     NOT NULL,
  parent_id   CHAR(36)     NULL,
  name        VARCHAR(191) NOT NULL,
  description TEXT NULL,
  feature     VARCHAR(191) NULL,
  type        VARCHAR(40)  NULL,
  tags        JSON NULL,
  position    INT NOT NULL DEFAULT 0,
  archived_at DATETIME(3)  NULL,
  created_by  CHAR(36)     NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_suite_project (project_id, archived_at, parent_id),
  CONSTRAINT fk_suite_project FOREIGN KEY (project_id) REFERENCES projects(id)    ON DELETE RESTRICT,
  CONSTRAINT fk_suite_parent  FOREIGN KEY (parent_id)  REFERENCES test_suites(id) ON DELETE RESTRICT,
  CONSTRAINT fk_suite_user    FOREIGN KEY (created_by) REFERENCES users(id)       ON DELETE RESTRICT
);

CREATE TABLE test_suite_cases (
  id           CHAR(36) NOT NULL PRIMARY KEY,
  suite_id     CHAR(36) NOT NULL,
  test_case_id CHAR(36) NOT NULL,
  position     INT      NOT NULL DEFAULT 0,
  UNIQUE KEY uq_tsc (suite_id, test_case_id),
  KEY ix_tsc_case (test_case_id),
  CONSTRAINT fk_tsc_suite FOREIGN KEY (suite_id)     REFERENCES test_suites(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsc_case  FOREIGN KEY (test_case_id) REFERENCES test_cases(id)  ON DELETE RESTRICT
);

CREATE TABLE test_runs (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  project_id    CHAR(36)     NOT NULL,
  seq           INT          NOT NULL,
  code          VARCHAR(40)  NOT NULL,
  name          VARCHAR(191) NOT NULL,
  description   TEXT NULL,
  environment   ENUM('DEVELOPMENT','QA','STAGING','PRODUCTION') NOT NULL DEFAULT 'QA',
  build_version VARCHAR(100) NULL,
  platform      ENUM('WEB','ANDROID','IOS','API') NOT NULL DEFAULT 'WEB',
  status        ENUM('DRAFT','IN_PROGRESS','COMPLETED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  planned_start DATETIME(3) NULL,
  planned_end   DATETIME(3) NULL,
  started_at    DATETIME(3) NULL,
  completed_at  DATETIME(3) NULL,
  created_by    CHAR(36)    NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_run_project_seq (project_id, seq),
  UNIQUE KEY uq_run_code (code),
  KEY ix_run_filters (project_id, status, environment, build_version),
  KEY ix_run_planned (planned_start),
  CONSTRAINT fk_run_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_run_user    FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE RESTRICT
);

CREATE TABLE test_run_testers (
  run_id  CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  PRIMARY KEY (run_id, user_id),
  CONSTRAINT fk_rt_run  FOREIGN KEY (run_id)  REFERENCES test_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id)     ON DELETE RESTRICT
);

CREATE TABLE test_run_suites (
  run_id   CHAR(36) NOT NULL,
  suite_id CHAR(36) NOT NULL,
  PRIMARY KEY (run_id, suite_id),
  CONSTRAINT fk_rs_run   FOREIGN KEY (run_id)   REFERENCES test_runs(id)   ON DELETE CASCADE,
  CONSTRAINT fk_rs_suite FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE RESTRICT
);

-- One row per test case in a run. `snapshot` freezes title/preconditions/steps at run creation.
CREATE TABLE test_run_cases (
  id                    CHAR(36) NOT NULL PRIMARY KEY,
  run_id                CHAR(36) NOT NULL,
  test_case_id          CHAR(36) NOT NULL,
  test_case_version_id  CHAR(36) NOT NULL,
  position              INT      NOT NULL DEFAULT 0,
  snapshot              JSON     NOT NULL,
  assignee_id           CHAR(36) NULL,
  status                ENUM('NOT_RUN','PASSED','FAILED','BLOCKED','SKIPPED','RETEST') NOT NULL DEFAULT 'NOT_RUN',
  last_executed_at      DATETIME(3) NULL,
  UNIQUE KEY uq_trc (run_id, test_case_id),
  KEY ix_trc_status (run_id, status),
  KEY ix_trc_assignee (assignee_id),
  KEY ix_trc_case (test_case_id),
  CONSTRAINT fk_trc_run     FOREIGN KEY (run_id)               REFERENCES test_runs(id)          ON DELETE RESTRICT,
  CONSTRAINT fk_trc_case    FOREIGN KEY (test_case_id)         REFERENCES test_cases(id)         ON DELETE RESTRICT,
  CONSTRAINT fk_trc_version FOREIGN KEY (test_case_version_id) REFERENCES test_case_versions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_trc_user    FOREIGN KEY (assignee_id)          REFERENCES users(id)              ON DELETE SET NULL
);

-- Append-only: every save of a result is a new row; test_run_cases.status caches the latest.
CREATE TABLE test_executions (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  run_case_id   CHAR(36) NOT NULL,
  executed_by   CHAR(36) NOT NULL,
  status        ENUM('NOT_RUN','PASSED','FAILED','BLOCKED','SKIPPED','RETEST') NOT NULL,
  actual_result TEXT NULL,
  comment       TEXT NULL,
  executed_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_te_runcase (run_case_id, executed_at),
  KEY ix_te_user (executed_by),
  CONSTRAINT fk_te_runcase FOREIGN KEY (run_case_id) REFERENCES test_run_cases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_te_user    FOREIGN KEY (executed_by) REFERENCES users(id)          ON DELETE RESTRICT
);

CREATE TABLE test_execution_steps (
  id            CHAR(36) NOT NULL PRIMARY KEY,
  execution_id  CHAR(36) NOT NULL,
  step_position INT      NOT NULL,
  status        ENUM('NOT_RUN','PASSED','FAILED','BLOCKED','SKIPPED','RETEST') NOT NULL DEFAULT 'NOT_RUN',
  actual_result TEXT NULL,
  UNIQUE KEY uq_tes (execution_id, step_position),
  CONSTRAINT fk_tes_exec FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE RESTRICT
);

CREATE TABLE defects (
  id                CHAR(36)     NOT NULL PRIMARY KEY,
  project_id        CHAR(36)     NOT NULL,
  seq               INT          NOT NULL,
  code              VARCHAR(40)  NOT NULL,
  title             VARCHAR(255) NOT NULL,
  description       TEXT NULL,
  steps_to_reproduce TEXT NULL,
  expected_result   TEXT NULL,
  actual_result     TEXT NULL,
  severity          ENUM('CRITICAL','MAJOR','MINOR','TRIVIAL') NOT NULL DEFAULT 'MAJOR',
  priority          ENUM('CRITICAL','HIGH','MEDIUM','LOW') NOT NULL DEFAULT 'MEDIUM',
  status            ENUM('OPEN','IN_PROGRESS','FIXED','RETEST','CLOSED','REOPENED') NOT NULL DEFAULT 'OPEN',
  environment       ENUM('DEVELOPMENT','QA','STAGING','PRODUCTION') NULL,
  build_version     VARCHAR(100) NULL,
  external_url      VARCHAR(500) NULL,
  assignee_id       CHAR(36) NULL,
  reporter_id       CHAR(36) NOT NULL,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_defect_project_seq (project_id, seq),
  UNIQUE KEY uq_defect_code (code),
  KEY ix_defect_filters (project_id, status, severity),
  CONSTRAINT fk_defect_project  FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_defect_assignee FOREIGN KEY (assignee_id) REFERENCES users(id)    ON DELETE SET NULL,
  CONSTRAINT fk_defect_reporter FOREIGN KEY (reporter_id) REFERENCES users(id)    ON DELETE RESTRICT
);

-- Many executions may reference one defect (and vice versa).
CREATE TABLE test_execution_defects (
  execution_id CHAR(36) NOT NULL,
  defect_id    CHAR(36) NOT NULL,
  linked_by    CHAR(36) NOT NULL,
  linked_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (execution_id, defect_id),
  KEY ix_ted_defect (defect_id),
  CONSTRAINT fk_ted_exec   FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ted_defect FOREIGN KEY (defect_id)    REFERENCES defects(id)         ON DELETE RESTRICT,
  CONSTRAINT fk_ted_user   FOREIGN KEY (linked_by)    REFERENCES users(id)           ON DELETE RESTRICT
);

CREATE TABLE attachments (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  project_id   CHAR(36)     NOT NULL,
  file_name    VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(127) NOT NULL,
  size_bytes   INT          NOT NULL,
  storage_key  VARCHAR(255) NOT NULL,
  uploaded_by  CHAR(36)     NOT NULL,
  execution_id CHAR(36) NULL,
  defect_id    CHAR(36) NULL,
  test_case_id CHAR(36) NULL,
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_att_key (storage_key),
  KEY ix_att_exec (execution_id),
  KEY ix_att_defect (defect_id),
  KEY ix_att_case (test_case_id),
  CONSTRAINT fk_att_project FOREIGN KEY (project_id)   REFERENCES projects(id)        ON DELETE RESTRICT,
  CONSTRAINT fk_att_user    FOREIGN KEY (uploaded_by)  REFERENCES users(id)           ON DELETE RESTRICT,
  CONSTRAINT fk_att_exec    FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_att_defect  FOREIGN KEY (defect_id)    REFERENCES defects(id)         ON DELETE RESTRICT,
  CONSTRAINT fk_att_case    FOREIGN KEY (test_case_id) REFERENCES test_cases(id)      ON DELETE RESTRICT
);

CREATE TABLE comments (
  id          CHAR(36) NOT NULL PRIMARY KEY,
  author_id   CHAR(36) NOT NULL,
  body        TEXT     NOT NULL,
  run_case_id CHAR(36) NULL,
  defect_id   CHAR(36) NULL,
  test_case_id CHAR(36) NULL,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_cm_runcase (run_case_id),
  KEY ix_cm_defect (defect_id),
  KEY ix_cm_case (test_case_id),
  CONSTRAINT fk_cm_user    FOREIGN KEY (author_id)    REFERENCES users(id)          ON DELETE RESTRICT,
  CONSTRAINT fk_cm_runcase FOREIGN KEY (run_case_id)  REFERENCES test_run_cases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cm_defect  FOREIGN KEY (defect_id)    REFERENCES defects(id)        ON DELETE RESTRICT,
  CONSTRAINT fk_cm_case    FOREIGN KEY (test_case_id) REFERENCES test_cases(id)     ON DELETE RESTRICT
);

CREATE TABLE audit_logs (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  user_id     CHAR(36)     NULL,
  project_id  CHAR(36)     NULL,
  action      VARCHAR(64)  NOT NULL,
  entity_type VARCHAR(64)  NOT NULL,
  entity_id   VARCHAR(64)  NULL,
  metadata    JSON NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_project (project_id, created_at),
  KEY ix_audit_user (user_id, created_at),
  KEY ix_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
