-- A test case may be deleted once every run containing it is COMPLETED. The run keeps its frozen
-- `snapshot` (code, title, steps) and results; test_case_id just becomes NULL.
ALTER TABLE test_run_cases DROP FOREIGN KEY fk_trc_case;
ALTER TABLE test_run_cases MODIFY test_case_id CHAR(36) NULL;
ALTER TABLE test_run_cases ADD CONSTRAINT fk_trc_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL;
