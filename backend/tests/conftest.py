import os

# Allow pytest to import the app without requiring a running Postgres instance.
os.environ.setdefault("SKIP_DB_BOOTSTRAP", "1")
