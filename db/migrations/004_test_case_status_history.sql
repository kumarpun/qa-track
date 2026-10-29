-- Append-only log of manual status changes on a test case, shown in the case's result history next to run results.
CREATE TABLE test_case_status_history (
  id           CHAR(36)    NOT NULL PRIMARY KEY,
  test_case_id CHAR(36)    NOT NULL,
  status       ENUM('PASSED','FAILED','BLOCKED','NOT_EXECUTED','IN_PROGRESS','SKIPPED') NOT NULL,
  changed_by   CHAR(36)    NOT NULL,
  changed_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_tcsh_case (test_case_id, changed_at),
  CONSTRAINT fk_tcsh_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_tcsh_user FOREIGN KEY (changed_by)   REFERENCES users(id)      ON DELETE RESTRICT
);

-- Cases whose status was already set before this log existed get one entry at their last update.
INSERT INTO test_case_status_history (id, test_case_id, status, changed_by, changed_at)
SELECT UUID(), id, status, author_id, updated_at FROM test_cases WHERE status <> 'NOT_EXECUTED'
