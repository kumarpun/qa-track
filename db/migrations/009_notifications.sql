-- In-app notifications (currently only @mentions in comments). Deleting the comment, or the user, removes the notification.
CREATE TABLE notifications (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  user_id    CHAR(36)     NOT NULL,
  actor_id   CHAR(36)     NOT NULL,
  project_id CHAR(36)     NOT NULL,
  comment_id CHAR(36)     NOT NULL,
  type       VARCHAR(20)  NOT NULL DEFAULT 'MENTION',
  label      VARCHAR(255) NOT NULL,
  snippet    VARCHAR(255) NOT NULL,
  href       VARCHAR(255) NOT NULL,
  read_at    DATETIME(3)  NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_notif_comment_user (comment_id, user_id),
  KEY ix_notif_user (user_id, read_at, created_at),
  CONSTRAINT fk_notif_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_notif_actor   FOREIGN KEY (actor_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_notif_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE
);
