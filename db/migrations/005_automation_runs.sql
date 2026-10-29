-- One row per "Run in browser" execution of a test case: the per-step log and, for a failure, a screenshot kept on disk.
CREATE TABLE test_case_auto_runs (
  id              CHAR(36)    NOT NULL PRIMARY KEY,
  test_case_id    CHAR(36)    NOT NULL,
  status          ENUM('PASSED','FAILED') NOT NULL,
  triggered_by    CHAR(36)    NOT NULL,
  started_at      DATETIME(3) NOT NULL,
  finished_at     DATETIME(3) NOT NULL,
  log             JSON        NOT NULL,
  final_url       VARCHAR(2048) NULL,
  screenshot_key  VARCHAR(255) NULL,
  KEY ix_tcar_case (test_case_id, started_at),
  CONSTRAINT fk_tcar_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_tcar_user FOREIGN KEY (triggered_by) REFERENCES users(id)      ON DELETE RESTRICT
);

-- Lets the result history say "Browser run" instead of "Status set manually" for entries written by a run.
ALTER TABLE test_case_status_history ADD COLUMN auto_run_id CHAR(36) NULL
