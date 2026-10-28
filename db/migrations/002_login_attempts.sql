-- Failed sign-in attempts, used for per-email lockout. Rows are pruned opportunistically on success.
CREATE TABLE login_attempts (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  email      VARCHAR(191) NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_login_attempts_email (email, created_at)
);
