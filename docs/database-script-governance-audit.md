# Database and Script Governance Audit

## Purpose

This audit documents the current status of risky database, SQL, migration, seed, test, generated, and script artifacts that remain after the non-runtime artifact cleanup phases.

The goal is not to clean or reorganize these files immediately. The goal is to make future cleanup safer by identifying which files are destructive, path-coupled, migration-critical, generated, or intentionally retained for test coverage and operational workflows.

## Summary Recommendation

Phase 3D implementation should be skipped for now.

The remaining files are not simple clutter. Several scripts alter database schema, reset data, seed records, read adjacent SQL files by relative path, or participate in Jest discovery. Moving or deleting these files without a database owner review could break manual workflows or cause data loss.

The safest next step is documentation and governance first, followed by database-owner review and development-database testing before any cleanup is attempted.

## Classification Table

| File/Folder | Category | Risk Level | Recommendation | Reason |
|---|---|---:|---|---|
| `database_reset.sql` | Database reset SQL | High | Do not touch | Root-level reset SQL may be destructive if run. Keep until reviewed with database owner. |
| `server/database_migration.sql` | Loose SQL migration artifact | Medium | Needs manual review | Not package-referenced, but may be a historical or manual migration artifact. |
| `server/sync_infants_schema.sql` | Schema sync SQL | High | Keep in place | Read by `server/execute_sync.js` through an adjacent relative path. |
| `server/seed_50_infants.sql` | Seed SQL | Medium | Keep in place | Read by `server/seed_runner.js` through an adjacent relative path. |
| `server/seed_runner.js` | Seed runner | Medium | Keep in place | Coupled to `server/seed_50_infants.sql`; moving one without the other breaks the command. |
| `server/execute_seed.js` | Seed runner | Medium | Keep in place | Reads `server/scripts/seed_clustered_data.sql`; manual data-seeding workflow. |
| `server/execute_sync.js` | Schema/data sync runner | High | Keep in place | Reads `server/sync_infants_schema.sql` and executes SQL against the database. |
| `server/fix.js` | Runtime-file repair script | High | Do not touch | Mutates `routes/analytics.js` if executed. Treat as dangerous legacy repair script. |
| `server/fix_schema.js` | Direct schema fix script | High | Do not touch | Alters database constraints directly. Requires backup and owner approval before use. |
| `server/alter.js` | Direct schema alteration script | High | Do not touch | Adds a database column directly. Requires backup and owner approval before use. |
| `server/run_fix_migration.js` | Migration runner | Medium | Keep in place | Reads `server/migrations/fix_phase4_schema.sql` by relative path. |
| `server/run_tcl_migration.js` | Inline migration runner | High | Do not touch | Executes inline `ALTER TABLE` statements. Requires review before use or cleanup. |
| `server/scripts/**` | Operational scripts | Medium to High | Keep in place | Already organized; includes seeding, inspection, testing, maintenance, migration, and verification workflows. |
| `server/migrations/**` | Migration history | High | Do not touch | Schema history and manual migration workflows depend on stable paths and contents. |
| `server/tests/*.test.js` | Jest tests | Medium | Do not touch casually | Jest discovers `**/tests/**/*.test.js`; some ignored tests are intentionally retained. |
| `client/dist/` | Generated build output | Low | Do not touch in cleanup phase | Ignored generated artifact. Regenerate through `npm run build` rather than manually editing. |
| `.codex-temp/` | Browser audit/tool artifacts | Medium | Do not touch | Contains generated browser audit files and local tool dependencies; some files may be tracked. |

## Destructive or Dangerous Scripts

The following files should not be run casually:

- `database_reset.sql`
- `server/execute_sync.js`
- `server/fix.js`
- `server/fix_schema.js`
- `server/alter.js`
- `server/run_tcl_migration.js`
- `server/scripts/maintenance/clear_infants.js`
- `server/scripts/maintenance/reset_system.js`
- `server/scripts/clean_duplicates.js`
- `server/scripts/run_rebuild.js`
- `server/scripts/migrate_to_postgres.js`
- `server/migrations/run_*.js`
- `server/migrations/apply_*.js`
- `server/migrations/hard_reset_doh_rules.sql`
- `server/migrations/harden_governance.sql`

These files can alter schema, remove data, rebuild tables, reset state, clean records, or apply historical migration behavior. They should only be used with:

- database owner approval
- a verified database backup
- a development database first
- a documented rollback path

## Path-Coupled Scripts

These files use relative paths to read adjacent or known-location SQL files:

| Script | Referenced File | Coupling |
|---|---|---|
| `server/execute_sync.js` | `server/sync_infants_schema.sql` | Uses `path.join(__dirname, 'sync_infants_schema.sql')`. |
| `server/seed_runner.js` | `server/seed_50_infants.sql` | Uses `path.join(__dirname, 'seed_50_infants.sql')`. |
| `server/execute_seed.js` | `server/scripts/seed_clustered_data.sql` | Uses `path.join(__dirname, 'scripts', 'seed_clustered_data.sql')`. |
| `server/run_fix_migration.js` | `server/migrations/fix_phase4_schema.sql` | Uses `path.join(__dirname, 'migrations', 'fix_phase4_schema.sql')`. |
| `server/scripts/run_rebuild.js` | `server/scripts/rebuild_schema.sql` | Reads SQL from the same scripts directory. |

Do not move these scripts or their SQL files unless the references are updated and tested in a development database.

## Migration and Seed Files

Migration and seed files should remain stable because they preserve database history, manual recovery paths, and environment bootstrap workflows.

Keep in place:

- `server/migrations/**`
- `server/scripts/rebuild_schema.sql`
- `server/scripts/pg_schema.sql`
- `server/scripts/seed_clustered_data.sql`
- `server/scripts/sql/resolve_duplicate_full_names.sql`
- `server/scripts/seeding/**`
- `server/seed_50_infants.sql`
- `server/sync_infants_schema.sql`

Needs manual review before any future archive decision:

- `server/database_migration.sql`
- `server/schema_dump.sql`
- `server/schema_dump_utf8.sql`
- `database_reset.sql`

The project documentation currently notes that PostgreSQL is the live database target and that `server/scripts/rebuild_schema.sql` plus `server/migrations/**` are important schema references. Historical SQL artifacts should be labeled before they are moved.

## Tests

Jest is configured through `server/jest.config.js` to discover:

```text
**/tests/**/*.test.js
```

It also uses:

- `server/tests/setup.js`
- `server/tests/mocks/uuid.js`

Some `.test.js` files are intentionally listed in `testPathIgnorePatterns`. These ignored tests should still not be moved casually because they may be retained for adversarial, property, governance, or manual validation runs.

Do not move or rename `server/tests/*.test.js` without a separate test-governance decision.

## Generated and Ignored Artifacts

`client/dist/` is generated by the client build process. It should not be manually edited. If stale, regenerate it with:

```text
cd client
npm run build
```

`.codex-temp/` contains browser audit artifacts, screenshots, package metadata, and local tool dependencies. Some contents are ignored while some audit outputs may be tracked. It should remain untouched unless there is a dedicated cleanup plan for generated browser audit assets.

## Rules for Future Developers

- Do not move SQL, migration, or seed files without checking references first.
- Do not run reset, fix, sync, alter, rebuild, or maintenance scripts without a verified database backup.
- Do not run database scripts against production unless explicitly approved by the database owner/client.
- Do not move path-coupled scripts unless paths are updated and tested.
- Do not move Jest test files casually.
- Do not edit generated `client/dist/` output by hand.
- Do not clean `.codex-temp/` as part of ordinary refactoring.
- Document whether a database script is canonical, historical, destructive, or development-only before changing its location.

## Safe Future Cleanup Plan

1. Document first.
2. Review the risky files with the database owner or client.
3. Classify each SQL/script file as canonical, historical, destructive, development-only, or obsolete.
4. Back up the database before any script execution.
5. Test all proposed cleanup in a development database only.
6. Update references and manual runbooks before moving path-coupled files.
7. Run frontend tests, client build, and server test discovery.
8. Consider cleanup only after the above steps pass and stakeholders approve.

Until then, Phase 3D should remain analysis-only.
