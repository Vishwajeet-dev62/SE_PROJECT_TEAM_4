-- Align the project_members table with the application contract.
ALTER TABLE project_members
  RENAME COLUMN member_role TO project_role;