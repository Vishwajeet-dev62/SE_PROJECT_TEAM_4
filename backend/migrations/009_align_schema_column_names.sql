-- Align the projects table with the application contract.
ALTER TABLE projects
  RENAME COLUMN archived TO is_archived;