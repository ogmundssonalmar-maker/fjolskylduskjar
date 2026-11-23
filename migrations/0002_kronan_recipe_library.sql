CREATE TABLE IF NOT EXISTS kronan_recipe_library (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recipes TEXT NOT NULL
);
