# Super Admin V2 Implementation Plan

## Root Cause Findings

### 1. Authorization Gate

`server/routes/admin.js` is protected by `adminAuth`, and `server/middleware/adminAuth.js` correctly calls:

```js
requireAuthenticatedUser(req, [ROLES.SUPER_ADMIN, ROLES.ADMIN])
```

So the route middleware itself is not the blocker. The actual Super Admin block is inside `server/services/AuditLogService.js#getDashboardSummary()`, which currently rejects any user whose role is not `ROLES.ADMIN`:

```js
if (user?.role !== ROLES.ADMIN) {
    const error = new Error('Forbidden: dashboard audit summary is limited to Admin users.');
    error.status = 403;
    throw error;
}
```

That service method is called by `server/routes/admin.js#getAuditSummary()`, then used by:

- `GET /api/admin/dashboard/audit-summary`
- `GET /api/admin/dashboard/superadmin-summary`

Because `superadmin-summary` aggregates audit events, this one Admin-only service guard can make the Super Admin dashboard return authorization errors even though the router-level auth accepts Super Admin.

### 2. Ranking Query

The backend performance-gap source is `server/services/SpatialDSSService.js#getPerformanceGap()`, called by `server/routes/spatialDss.js` at:

```txt
GET /api/spatial/performance-gap
```

The backend query currently ends with:

```sql
ORDER BY base.barangay ASC
```

The current rank inversion is then introduced in `client/src/pages/admin/SuperAdminMap.jsx`, where `viewRows` is sorted by largest gap first:

```js
return rows.sort((a, b) => b.gapValue - a.gapValue || a.barangay.localeCompare(b.barangay));
```

If Rank 1 should represent the barangay with the lowest operational deficit, both backend and frontend should use ascending gap order. The requested `ORDER BY gap ASC` should be implemented in the SQL using an alias or repeated expression, and the frontend sort should become `a.gapValue - b.gapValue`.

### 3. Chart Wrapper

`client/src/pages/admin/PublicHealthDashboard.jsx` wraps the Recharts `<ResponsiveContainer>` in:

```jsx
<div className="h-[360px] p-6">
    <ResponsiveContainer width="100%" height="100%">
```

This normally has height, but the chart is inside a clickable `<section role="button">` and conditional render branches can briefly mount the `ResponsiveContainer` while parent width/height is not yet measurable. The fix should add a stable relative chart frame with explicit min dimensions and keep `ResponsiveContainer` inside that frame, not directly inside a padded container.

### 4. Panel Containers

The geospatial page is `client/src/pages/admin/SuperAdminMap.jsx`.

Clinical oversight ranking panel:

- State already exists as `tableOpen` / `setTableOpen`.
- Header toggle exists near the map header.
- Ranking table is limited by:

```jsx
<div className="max-h-[640px] w-full overflow-x-auto overflow-y-auto">
```

Cluster ranking sidebar:

- No open/close state exists for the cluster sidebar.
- Ranked list is limited by:

```jsx
<div className="max-h-[560px] overflow-auto">
```

The requested `max-h-[400px]` limit was not found in the current file, but the same internal-scroll problem exists through `max-h-[640px]`, `max-h-[560px]`, and `overflow-y-auto` / `overflow-auto`.

## 1. Authorization & Labeling Fixes

### Backend Plan

Files:

- `server/services/AuditLogService.js`
- `server/routes/admin.js`
- `server/tests/superadmin_dashboard.test.js`
- Optional: `server/tests/audit_log_service.test.js`

Implementation:

1. Update `AuditLogService.getDashboardSummary({ user })` to allow both roles:

```js
if (![ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(user?.role)) {
    const error = new Error('Forbidden: dashboard audit summary is limited to Admin and Super Admin users.');
    error.status = 403;
    throw error;
}
```

2. Branch the audit summary scope:

- For `ROLES.ADMIN`, keep the existing `_appendAdminScope(where, params, user)`.
- For `ROLES.SUPER_ADMIN`, do not apply barangay scoping by default, so municipal dashboard audit activity can render.
- If later needed, accept an optional `barangay` filter for Super Admin dashboard summaries, but do not block municipality-wide view.

3. Confirm `server/routes/admin.js` does not add an additional Admin-only guard around `/dashboard/audit-summary`. The route should rely on `adminAuth` plus service-level Admin/Super Admin validation.

4. Update the existing `server/tests/superadmin_dashboard.test.js` so the Super Admin summary test fails if `getDashboardSummary()` throws 403.

5. Add a focused unit test in `audit_log_service.test.js` or equivalent:

- Super Admin can call `getDashboardSummary()`.
- Admin can call `getDashboardSummary()` with barangay scope.
- BHW/Midwife/Caregiver cannot call it.

### Frontend Labeling Plan

File:

- `client/src/pages/admin/PublicHealthDashboard.jsx`

Implementation:

1. Relabel the workforce section for Super Admin from:

```txt
Barangay User Summary
Active Personnel in RHU 2 - All Barangays
```

to:

```txt
Municipal Workforce Counts
Active BHWs, Midwives, and clinical personnel across RHU 2
```

2. Keep Admin copy local:

```txt
Barangay User Summary
Active BHWs and Midwives in {assignedBarangay}
```

3. Add helper text explaining why dashboard workforce totals differ from User Management:

```txt
Dashboard workforce counts include active clinical personnel. User Management shows only Barangay Admin accounts managed by Super Admin.
```

This clarifies why a dashboard total such as `16 personnel` differs from the `6 Barangay Admins` listed in Super Admin user management.

## 2. Core Dashboard Component Swap

### Goal

Remove the localized “Local Cluster Map” panel from the Super Admin dashboard and replace it with a dense “Barangay Target Performance Ranking Table” so the Super Admin sees municipal operational ranking immediately on the home screen.

### Files

- `client/src/pages/admin/PublicHealthDashboard.jsx`
- `server/routes/admin.js`
- `server/services/SpatialDSSService.js`
- Optional service helper: reuse existing `/api/spatial/performance-gap`, or expose a dashboard-friendly proxy from `/api/admin/dashboard/target-ranking`.

### Backend Data Plan

Preferred implementation:

1. Reuse `SpatialDSSService.getPerformanceGap()` for target-ranking rows.
2. Add a Super Admin/Admin-safe dashboard endpoint in `server/routes/admin.js`:

```txt
GET /api/admin/dashboard/target-ranking?year=YYYY&month=M&barangay=all|name
```

3. Use existing `getDashboardScope(req)`:

- Super Admin with no barangay: all RHU 2 barangays.
- Super Admin with selected barangay: selected barangay only.
- Admin: assigned barangay only.

4. Return compact rows:

```js
{
  success: true,
  scope,
  rows: [
    {
      rank,
      barangay,
      target,
      actual,
      gap,
      status
    }
  ],
  summary
}
```

5. Use ascending deficit ranking:

```sql
ORDER BY population_gap ASC, base.barangay ASC
```

If SQL cannot refer to `population_gap` in the same level consistently, wrap the `SELECT` as a subquery and order by the alias.

### Frontend Plan

1. In `PublicHealthDashboard.jsx`, add ranking state:

```js
const [targetRanking, setTargetRanking] = useState({ rows: [], summary: {} });
```

2. Fetch target ranking for Super Admin dashboard:

```txt
GET /api/admin/dashboard/target-ranking
```

3. Replace the Super Admin-only “Local Cluster Map” block with:

```jsx
<section className="border border-slate-200 bg-white shadow-sm xl:col-span-2">
    <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Barangay Target Performance
        </p>
        <h2 className="mt-1 text-xl font-black text-slate-950">
            Barangay Target Performance Ranking Table
        </h2>
    </div>
    ...
</section>
```

4. Columns:

- Rank
- Barangay
- NIP Eligible Target
- Actual Population
- Operational Gap
- Action Status

5. For Admin dashboard only, keep the existing local cluster panel, since it is still useful for barangay-level users.

6. If the endpoint fails, show the existing rose clinical error panel rather than blanking to zeros.

### Recharts Wrapper Plan

File:

- `client/src/pages/admin/PublicHealthDashboard.jsx`

Change the chart frame from:

```jsx
<div className="h-[360px] p-6">
    <ResponsiveContainer width="100%" height="100%">
```

to a stable two-layer wrapper:

```jsx
<div className="relative min-h-[360px] w-full p-6">
    <div className="absolute inset-6 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
```

or, if avoiding absolute positioning:

```jsx
<div className="relative min-h-[360px] w-full p-6">
    <div className="h-[300px] min-h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
```

The second version is lower risk because the explicit child height is simpler for Recharts to measure.

## 3. Geospatial Sorting & Panel Overhaul

### Sorting Plan

Files:

- `server/services/SpatialDSSService.js`
- `client/src/pages/admin/SuperAdminMap.jsx`
- `server/tests/superadmin_dashboard.test.js` or new `server/tests/spatial_dss_service.test.js`

Backend:

1. Change backend ordering from:

```sql
ORDER BY base.barangay ASC
```

to ascending operational deficit:

```sql
ORDER BY population_gap ASC, base.barangay ASC
```

Because `population_gap` is a selected alias, use a subquery if needed:

```sql
SELECT *
FROM (
  SELECT ..., GREATEST(base.total_population - base.actual_population, 0)::int AS population_gap
  FROM base
  ...
) ranked
ORDER BY ranked.population_gap ASC, ranked.barangay ASC
```

Frontend:

2. Change the current frontend sort from:

```js
return rows.sort((a, b) => b.gapValue - a.gapValue || a.barangay.localeCompare(b.barangay));
```

to:

```js
return rows.sort((a, b) => a.gapValue - b.gapValue || a.barangay.localeCompare(b.barangay));
```

This guarantees Rank 1 is the lowest operational deficit even if future API responses arrive unsorted.

### Panel Height Plan

File:

- `client/src/pages/admin/SuperAdminMap.jsx`

Clinical ranking table:

1. Remove internal vertical limit:

```diff
- <div className="max-h-[640px] w-full overflow-x-auto overflow-y-auto">
+ <div className="w-full overflow-x-auto">
```

Cluster ranking sidebar:

2. Remove internal vertical limit:

```diff
- <div className="max-h-[560px] overflow-auto">
+ <div className="overflow-x-hidden">
```

This allows the full ranking dataset to render in page flow without internal sliders.

### Toggle Plan

The clinical table already has `tableOpen` / `setTableOpen`. The requested new state should be added to the cluster sidebar:

```js
const [isPanelOpen, setIsPanelOpen] = useState(true);
```

Implementation:

1. Add `PanelLeftClose` / `PanelLeftOpen` or use existing `ChevronLeft` / `ChevronRight`.
2. Change the cluster map grid:

```jsx
<div className={`grid gap-0 ${isPanelOpen ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : 'xl:grid-cols-1'}`}>
```

3. Add a side panel header button:

```jsx
<button
    type="button"
    onClick={() => setIsPanelOpen((open) => !open)}
    className="border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
    aria-label={isPanelOpen ? 'Collapse ranking panel' : 'Open ranking panel'}
>
    {isPanelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
</button>
```

4. Render the ranking sidebar only when open:

```jsx
{isPanelOpen && (
    <aside className="border-t border-slate-300 xl:border-l xl:border-t-0">
        ...
    </aside>
)}
```

5. Add a compact floating/open button near the map header when the panel is closed so the user is not trapped without an affordance:

```jsx
{!isPanelOpen && (
    <button ...>
        <ChevronLeft className="h-4 w-4" />
        Show Ranking
    </button>
)}
```

## Validation Plan

### Backend Tests

Run targeted tests:

```bash
cd server
npm test -- --runInBand server/tests/superadmin_dashboard.test.js
```

Add or update tests to verify:

- `GET /api/admin/dashboard/audit-summary` returns 200 for Super Admin.
- `GET /api/admin/dashboard/superadmin-summary` returns 200 for Super Admin and includes recent audit events.
- `AuditLogService.getDashboardSummary()` allows Admin and Super Admin, rejects non-admin roles.
- Target ranking endpoint returns rows sorted by ascending gap.
- Admin target ranking ignores query/header barangay overrides and remains assigned-barangay scoped.

Run full backend suite:

```bash
cd server
npm test -- --runInBand
```

### Client Verification

Build:

```bash
cd client
npm run build
```

Manual smoke test:

- `/superadmin/dashboard`
  - No 403 from `audit-summary` or `superadmin-summary`.
  - Workforce section says “Municipal Workforce Counts.”
  - Local Cluster Map is absent for Super Admin.
  - Barangay Target Performance Ranking Table is visible.
  - Recharts no longer logs width/height `-1` warnings.

- `/superadmin/geospatial`
  - Barangay Target Ranking rank 1 has the lowest gap.
  - Ranking panel has no internal vertical slider.
  - Cluster ranking panel can collapse and reopen via chevron button.

- `/admin/dashboard`
  - Existing Admin localized dashboard behavior remains intact.
  - Admin audit summary remains barangay-scoped.

## Halt Condition

This is a read-only planning artifact. No implementation code should be changed until explicit approval is given for the execution phase.
