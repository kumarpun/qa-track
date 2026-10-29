-- Set when an author edits a comment, so the thread can show "(edited)". NULL = never edited.
ALTER TABLE comments ADD COLUMN edited_at DATETIME(3) NULL
