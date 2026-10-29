-- Manually tracked status of a test case (Pass, Fail, Blocked, ...). Workflow metadata like assignee, so it is not versioned content.
ALTER TABLE test_cases
  ADD COLUMN status ENUM('PASSED','FAILED','BLOCKED','NOT_EXECUTED','IN_PROGRESS','SKIPPED') NOT NULL DEFAULT 'NOT_EXECUTED' AFTER automation;
