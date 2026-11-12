# Plannr — backups, restores and migrations.
#
# Supabase's free tier takes no backups for you. These targets are the whole
# safety net, and they are deliberately conversational: each one walks through
# numbered steps and stops to explain itself, because the day you need `restore`
# is not the day to be reading a script for the first time.
#
# No secret is stored anywhere. The database password is prompted for, read
# without echo, and passed to pg_dump/psql through the environment — never on a
# command line, never into a file, never into your shell history.
#
# Full runbook: DISASTER_RECOVERY.md. Migrations: DEPLOYMENT.md, "Applying
# migrations". Agents never run migrate-* (.claude/settings.json denies it).

SHELL := /usr/bin/env bash

.PHONY: help doctor backup restore migrate-dev migrate-prod migrate-baseline bootstrap test

help:
	@echo ""
	@echo "  Plannr — backups, restores and migrations"
	@echo ""
	@echo "  make doctor      Check that this machine can take and restore a backup"
	@echo "  make backup      Guided backup of a Supabase project  (read-only)"
	@echo "  make restore     Guided restore into a Supabase project"
	@echo ""
	@echo "  make migrate-dev       Apply pending migrations to planr-dev"
	@echo "  make migrate-prod      make backup, then apply them to grep-prod"
	@echo "  make migrate-baseline  Mark migrations a project already holds as applied"
	@echo "                         (once after hand-applied SQL, and after every restore)"
	@echo ""
	@echo "  make bootstrap   Regenerate site/supabase/prod_bootstrap.sql from migrations"
	@echo "  make test        Run the site test suite"
	@echo ""
	@echo "  Backups land in ./backups/ (gitignored). Move a copy off this laptop."
	@echo ""

doctor:
	@bash scripts/doctor.sh

backup:
	@bash scripts/backup.sh

restore:
	@bash scripts/restore.sh

migrate-dev:
	@bash scripts/migrate.sh dev

migrate-prod:
	@bash scripts/migrate.sh prod

migrate-baseline:
	@bash scripts/migrate.sh baseline

bootstrap:
	@cd site && npm run db:bootstrap && npx vitest run scripts/build-bootstrap.test.ts

test:
	@cd site && npm test
