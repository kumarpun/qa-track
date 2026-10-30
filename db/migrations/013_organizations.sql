-- Multi-tenancy: every company signs up as its own organization. Users and projects belong to exactly one org,
-- and nothing crosses org lines (ADMIN now means "admin of my organization"). Existing data moves into one "Default" org.
CREATE TABLE organizations (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  name       VARCHAR(191) NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

INSERT INTO organizations (id, name) VALUES (UUID(), 'Default');

ALTER TABLE users ADD COLUMN org_id CHAR(36) NULL AFTER id;
UPDATE users SET org_id = (SELECT id FROM organizations ORDER BY created_at LIMIT 1);
ALTER TABLE users MODIFY org_id CHAR(36) NOT NULL;
ALTER TABLE users ADD KEY ix_users_org (org_id);
ALTER TABLE users ADD CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE projects ADD COLUMN org_id CHAR(36) NULL AFTER id;
UPDATE projects SET org_id = (SELECT org_id FROM users WHERE users.id = projects.owner_id);
ALTER TABLE projects MODIFY org_id CHAR(36) NOT NULL;
ALTER TABLE projects ADD CONSTRAINT fk_projects_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE RESTRICT;

-- Keys and the codes built from them (TC-KEY-0001, RUN-KEY-…, DEF-KEY-…) only need to be unique inside an org / project.
ALTER TABLE projects DROP INDEX uq_projects_key;
ALTER TABLE projects ADD UNIQUE KEY uq_projects_org_key (org_id, `key`);
ALTER TABLE test_cases DROP INDEX uq_tc_code;
ALTER TABLE test_cases ADD UNIQUE KEY uq_tc_project_code (project_id, code);
ALTER TABLE test_runs DROP INDEX uq_run_code;
ALTER TABLE test_runs ADD UNIQUE KEY uq_run_project_code (project_id, code);
ALTER TABLE defects DROP INDEX uq_defect_code;
ALTER TABLE defects ADD UNIQUE KEY uq_defect_project_code (project_id, code);
