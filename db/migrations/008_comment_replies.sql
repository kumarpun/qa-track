-- Replies: a comment with parent_id set belongs to that thread. Deleting a thread starter removes its replies.
ALTER TABLE comments ADD COLUMN parent_id CHAR(36) NULL;
ALTER TABLE comments ADD KEY ix_cm_parent (parent_id);
ALTER TABLE comments ADD CONSTRAINT fk_cm_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
