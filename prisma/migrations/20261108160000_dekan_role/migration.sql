-- Separate migration: PostgreSQL must commit the enum value before it is used.
ALTER TYPE "Role" ADD VALUE 'dekan';
