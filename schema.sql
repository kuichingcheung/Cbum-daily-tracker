-- Diet storage for cbum-daily-tracker.
-- Run each statement on its own (Turso evolve_schema accepts one DDL statement).
-- Do not run these against any other database.

-- statement
CREATE TABLE IF NOT EXISTS diet_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1))
);

-- statement
CREATE TABLE IF NOT EXISTS diet_rules (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL CHECK (json_valid(payload))
);

-- statement
CREATE TABLE IF NOT EXISTS diet_days (
  date TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  document TEXT NOT NULL CHECK (json_valid(document))
);
