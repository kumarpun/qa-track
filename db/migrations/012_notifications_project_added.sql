-- Notifications that are not tied to a comment (e.g. "added you to a project"). Mentions keep their comment link.
ALTER TABLE notifications MODIFY comment_id CHAR(36) NULL;
