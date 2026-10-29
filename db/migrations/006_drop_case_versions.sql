-- Test cases are edited in place: no version history. Runs keep their own frozen JSON copy in test_run_cases.snapshot.
ALTER TABLE test_run_cases DROP FOREIGN KEY fk_trc_version;
ALTER TABLE test_run_cases DROP COLUMN test_case_version_id;
DROP TABLE test_case_versions;
ALTER TABLE test_cases DROP COLUMN current_version;
