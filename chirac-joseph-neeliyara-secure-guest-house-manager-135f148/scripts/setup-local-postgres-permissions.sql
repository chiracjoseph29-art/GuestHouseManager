-- Run once as PostgreSQL superuser (e.g. postgres) against database ghms:
--   psql -U postgres -h 127.0.0.1 -d ghms -f scripts/setup-local-postgres-permissions.sql
--
-- Grants the ghms application role rights needed for Prisma migrations on schema public (PostgreSQL 15+).

ALTER DATABASE ghms OWNER TO ghms;

GRANT CONNECT, TEMPORARY ON DATABASE ghms TO ghms;

GRANT USAGE, CREATE ON SCHEMA public TO ghms;
GRANT ALL ON SCHEMA public TO ghms;
ALTER SCHEMA public OWNER TO ghms;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ghms;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ghms;
