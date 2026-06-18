# Maintainability Module Map

## Purpose

This document maps the largest and most complex IMMUNICARE modules so future refactoring can be planned safely. It is documentation-only and does not propose immediate code movement.

The goal is to make future work easier to sequence by identifying each file's responsibility, risk level, complexity drivers, and safe refactor direction.

## Summary Recommendation

Continue refactoring in small, test-backed phases. Start with documentation and pure frontend helper extraction before touching backend clinical, reporting, registration, RBAC, or database-adjacent behavior.

The safest near-term path is:

1. Add or strengthen tests around the target file.
2. Extract pure helpers or presentational components only.
3. Avoid behavior changes.
4. Verify after every phase.

## Module Map

| File | Main responsibility | Risk level | Why it is complex | Safe future refactor direction |
|---|---|---:|---|---|
| `server/services/M1ReportService.js` | M1 reporting, target configuration, monitoring charts, coverage dashboard, barangay DSS metrics | High | Large SQL-heavy service with reporting math, target schema compatibility, user scope handling, and multiple report shapes in one file | Add report-service tests first; then extract pure numeric/percentage helpers and SQL row mappers before splitting report domains |
| `server/services/InfantRegistrationService.js` | Draft registration, duplicate detection, validation queue, approval/promotion, rejection, correction, transfer merge | Very High | Core workflow service with many state transitions, audit events, legacy-compatible arguments, DB writes, and NIP schedule side effects | Add focused tests per workflow; extract pure normalizers/shape mappers first; avoid changing approval, merge, or audit behavior initially |
| `server/routes/admin.js` | Admin dashboards, user management, settings, audit feeds, target configuration routing | High | Many unrelated endpoint groups, RBAC checks, dashboard SQL, user lifecycle operations, and settings logic in one route module | Add route coverage by endpoint group; later split into route modules such as admin-dashboard, admin-users, admin-settings, and admin-audit |
| `server/services/InfantService.js` | Infant registry, search, spatial triage, transfers, infant updates, vaccination record access | High | Combines registry reads/writes, spatial aggregation, DBSCAN-related data, transfer workflow, and ID resolution | Add tests for ID resolution, registry filters, and transfer rules; extract pure response mappers and spatial helpers before service split |
| `client/src/pages/clinical/InfantRegistrationForm.jsx` | Multi-step infant registration UI, drafts, duplicate gate, map/address selection, submission | High | Large component with many state fields, form validation, address geocoding, duplicate override flow, and save/submit behavior | Extract pure form defaults, validators, and display helpers; then extract presentational sections after tests cover submission flows |
| `client/src/pages/admin/PublicHealthDashboard.jsx` | Public health dashboard UI, KPI loading, maps, rankings, audit widgets, user summaries | Medium-High | Combines multiple API loads, dashboard cards, map widgets, rankings, audit display, and error/loading states | Extract data-format helpers first; then split dashboard widgets into presentational components without changing API calls |
| `server/services/EnhancedNIPScheduleEngine.js` | NIP schedule generation, clinical status computation, authorization-aware schedule data | Very High | Encodes clinical schedule timing, legacy dose handling, defaulter/catch-up status, and registry filtering | Avoid broad refactor until stronger schedule scenario tests exist; extract only pure constants/helpers with exact test coverage |
| `server/services/VaccinationService.js` | Vaccination recording, validation, correction, dose completion, infant status update | Very High | Clinical governance logic, schedule matching, age/interval rules, DB writes, audit snapshots, and duplicate protection | Add clinical validation tests before any change; extract pure date/vaccine-code helpers only after tests prove parity |
| `client/src/pages/clinical/ValidationPage.jsx` | Midwife validation queue UI, detail review, approval/rejection/correction, transfer merge | High | Large page with queue loading, selected record detail, workflow actions, duplicate/transfer handling, and review display | Extract display helpers and small read-only components first; keep action handlers in place until workflow tests are expanded |
| `client/src/pages/admin/SuperAdminMap.jsx` | Super Admin spatial map, cluster analysis, population gap view, notifications | Medium-High | Map rendering, cluster calculations, performance gap loading, notification modal state, and date filters are mixed | Extract pure map helpers and formatters; then split map controls and summary panels from data-loading logic |

## Safe Frontend Refactor Candidates

These are good candidates for future low-risk extraction because they can be moved as pure helpers or presentational components:

- date and timestamp formatting helpers
- status badge label/class helpers
- local filter predicates
- API payload-to-view-model mappers
- read-only card/table/panel sections
- repeated empty/loading/error state rendering

Suggested first frontend targets:

- `client/src/pages/admin/PublicHealthDashboard.jsx`
- `client/src/pages/admin/SuperAdminMap.jsx`
- read-only sections of `client/src/pages/clinical/ValidationPage.jsx`

Avoid starting with submission, approval, rejection, merge, vaccination, or registration-save handlers.

## Backend Files That Need Tests Before Refactoring

Do not split these modules until tests cover the behavior being moved:

- `server/services/M1ReportService.js`
- `server/services/InfantRegistrationService.js`
- `server/routes/admin.js`
- `server/services/InfantService.js`
- `server/services/EnhancedNIPScheduleEngine.js`
- `server/services/VaccinationService.js`

Recommended test focus:

- M1 report totals, target fallbacks, and user scoping
- registration approval/rejection/correction/merge state transitions
- admin user-management authorization rules
- infant ID resolution and barangay scoping
- NIP schedule timing and catch-up/defaulter scenarios
- vaccination age, interval, duplicate, and schedule-entry validation

## High-Risk Files To Avoid Touching For Now

Avoid broad edits to:

- `server/services/VaccinationService.js`
- `server/services/EnhancedNIPScheduleEngine.js`
- `server/services/InfantRegistrationService.js`
- `server/services/M1ReportService.js`
- `server/routes/admin.js`

Reasons:

- clinical and reporting correctness risk
- DB-write and audit side effects
- RBAC and user-management risk
- legacy compatibility paths
- limited granular test coverage for every internal branch

## Recommended Refactor Order

1. Documentation-only maps and ownership notes.
2. Add targeted tests around one future refactor target.
3. Extract pure frontend helpers from dashboard/map display code.
4. Extract presentational frontend components with no behavior changes.
5. Add backend route/service tests around one endpoint group or workflow.
6. Split backend route modules only after route coverage exists.
7. Split backend services only after workflow and clinical/report tests exist.

## Testing Checklist Before Any Future Refactor

Before changing code:

```text
git status --short
cd client && npm test -- --run
cd client && npm run build
cd server && npm test -- --runInBand --listTests
```

For frontend helper/component extraction:

```text
cd client && npm test -- --run
cd client && npm run build
```

For backend route/service work:

```text
cd server && npm test -- --runInBand --listTests
cd server && npm test -- --runInBand
```

For clinical, reporting, registration, vaccination, or schedule behavior:

- add focused tests first
- run the relevant focused test file
- run the full client test/build and server test commands
- perform manual workflow testing in a development environment

## Rules For Future Developers

- Analyze first.
- Add tests first.
- Extract pure helpers before changing behavior.
- Avoid database and schema changes during maintainability refactors.
- Keep commits small and phase-scoped.
- Verify after every phase.
- Do not mix formatting, moves, and behavior changes in the same commit.
- Do not refactor clinical, vaccination, registration, reports, RBAC, or DB-adjacent code without explicit approval and targeted test coverage.
