CREATE TABLE household (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  tasks TEXT NOT NULL,
  meals TEXT NOT NULL
);
