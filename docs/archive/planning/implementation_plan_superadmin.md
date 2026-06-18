# Super Admin Interface Implementation Plan

## Audit Summary

The Super Admin workspace is routed through `client/src/components/SuperAdminLayout.jsx` and currently renders the global dashboard by reusing `client/src/pages/admin/PublicHealthDashboard.jsx`. The layout shell applies sidebar padding to the whole content column, but its `<main>` only uses `flex min-w-0 flex-1 overflow-x-hidden`; it does not provide a centered responsive content container. Pages that define their own `mx-auto max-w-7xl` container, such as `TargetConfiguration.jsx`, appear more stable, while pages such as `UserManagement.jsx` can inherit left-leaning whitespace from inconsistent page-level wrappers.

`UserManagement.jsx` works functionally but visually diverges from the sharper ImmuniCare clinical design used by `TargetConfiguration.jsx`, `FollowUpTasks.jsx`, and `DelegationModal.jsx`. It still uses rounded cards, softer SaaS-style buttons, blue focus rings, rounded badges, and mixed typography. The table should be refactored to use crisp borders, denser clinical typography, emerald/slate button variants, square modal frames, and consistent loading/empty/error treatment.

The dashboard data path is fragmented. `PublicHealthDashboard.jsx` fetches:

- `GET /api/reports/coverage-dashboard`
- `GET /api/admin/dashboard/clusters`
- `GET /api/admin/dashboard/audit-summary`
- `GET /api/admin/dashboard/user-summary`

The coverage endpoint is Super Admin-aware through `M1ReportService._resolveUserBarangay()`, but the `/api/admin/dashboard/*` handlers call `getAdminBarangayScope()`, which ultimately requires `req.user.assigned_barangay`. Super Admin accounts normally have `assigned_barangay = null`, so these dashboard widgets can fail or return empty data even when `apiClient` appends `?barangay=` or sends `x-admin-barangay`. The component also hard-codes `/admin/...` navigation routes while mounted under `/superadmin/dashboard`.

## Files To Modify

- `client/src/components/SuperAdminLayout.jsx`
- `client/src/components/AdminLayout.jsx`
- `client/src/pages/admin/UserManagement.jsx`
- `client/src/pages/admin/PublicHealthDashboard.jsx`
- `server/routes/admin.js`
- Optional, if the backend aggregation is moved out of the route file: `server/services/SuperAdminDashboardService.js`
- Optional test coverage: `server/tests/superadmin_dashboard.test.js`
- Optional frontend test coverage: `client/src/test/components/SuperAdminDashboard.test.jsx`

## Objective 1: Global Layout Centering

### Current Gap

`SuperAdminLayout.jsx` and `AdminLayout.jsx` use:

```jsx
<main className="flex min-w-0 flex-1 overflow-x-hidden">
    {children}
</main>
```

This delegates all content width, padding, and centering decisions to every page. Because the sidebar open/close state changes the available viewport width through `lg:pl-20` or `lg:pl-64`, pages without a centered inner wrapper can look left-heavy or overly wide.

### Implementation Steps

1. Update `SuperAdminLayout.jsx` `<main>` to provide the global content band and a centered responsive shell:

```jsx
<main className="flex min-w-0 flex-1 overflow-x-hidden bg-slate-50">
    <div className="mx-auto w-full max-w-screen-2xl min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {children}
    </div>
</main>
```

2. Apply the same wrapper pattern to `AdminLayout.jsx` for parity, unless visual regression testing shows existing Admin pages depend on page-level full-bleed wrappers.

3. Remove duplicated outer padding from Super Admin pages that already include `p-6 lg:p-8` as their first wrapper. For example:

- `TargetConfiguration.jsx`: change the root from `w-full min-w-0 bg-slate-50 p-6 lg:p-8` to `w-full min-w-0`.
- `PublicHealthDashboard.jsx`: change the root from `min-h-screen bg-slate-50 p-6 lg:p-8` to `min-w-0`.

4. Keep page-specific max-width wrappers where useful, but standardize them:

```jsx
<div className="mx-auto w-full max-w-7xl min-w-0 space-y-5">
```

5. Verify responsive behavior with sidebar expanded and collapsed:

- Desktop expanded: content centered inside remaining width.
- Desktop collapsed: content stays centered and does not jump left.
- Mobile: sidebar overlay does not introduce horizontal scroll.
- Wide desktop: content caps at `max-w-screen-2xl` while dense tables can still scroll horizontally inside their own containers.

## Objective 2: User Management UI Refactor

### Current Gap

`UserManagement.jsx` uses rounded cards and buttons such as `rounded-xl`, `rounded-lg`, `bg-slate-900`, blue focus rings, and softer status pills. This conflicts with the clinical theme visible in:

- `TargetConfiguration.jsx`: `border border-slate-300 bg-white`, emerald headers, uppercase labels, square inputs/buttons.
- `FollowUpTasks.jsx`: dense table rows, `bg-[#084C39]` table headers, `font-black uppercase tracking-*` headings.
- `DelegationModal.jsx`: square modal frame, crisp slate borders, emerald primary action.

### Implementation Steps

1. Refactor the page root to sit cleanly inside the new layout container:

```jsx
<div className="min-w-0 max-w-full space-y-5">
```

2. Replace the current rounded page header with a clinical section header:

- Container: `border border-slate-300 bg-white px-5 py-4`
- Eyebrow: `text-[10px] font-black uppercase tracking-[0.22em] text-[#064E3B]`
- Title: `text-2xl font-black text-slate-950`
- Description: `text-sm font-semibold text-slate-500`
- Primary button: `inline-flex h-10 items-center gap-2 bg-[#064E3B] px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-[#053B2D]`

3. Replace the search panel with a compact toolbar:

- Container: `flex flex-col gap-3 border border-slate-300 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between`
- Search input: `h-10 border border-slate-300 bg-white pl-9 pr-3 text-[11px] font-black uppercase tracking-wide text-slate-700 placeholder-slate-400 outline-none focus:border-[#064E3B]`
- Avoid blue focus rings; use emerald border focus.

4. Rewrite the table wrapper:

```jsx
<section className="overflow-hidden border border-slate-200 bg-white">
    <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
```

5. Standardize table headers to the requested ImmuniCare design system:

```jsx
<thead className="bg-[#084C39] text-white">
    <th className="px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-wider">...</th>
</thead>
```

If a light header is preferred for this screen, use:

```jsx
className="border-b border-slate-200 bg-slate-50 px-5 py-3.5 text-left text-[10px] font-black uppercase tracking-wider text-slate-500"
```

6. Update body rows:

- Row hover: `hover:bg-slate-50`
- Cell borders: `border-b border-slate-200`
- Staff name: `text-sm font-black text-slate-950`
- Staff ID: `font-mono text-[10px] font-bold uppercase tracking-wide text-slate-500`
- Avatar tile: `flex h-9 w-9 items-center justify-center border border-slate-200 bg-slate-50 text-xs font-black text-slate-600`

7. Replace role/status pills with square clinical badges:

- Active: `border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-[#064E3B]`
- Disabled: `border border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500`
- Admin: `border border-emerald-800 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800`
- Super Admin, if displayed: `border border-slate-900 bg-slate-900 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white`

8. Refactor action buttons to icon-driven clinical variants:

- Reset password: slate outline button with key/lock icon, `border border-slate-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-700 hover:bg-slate-50`
- Enable: emerald outline/soft button, `border border-emerald-700 bg-white text-emerald-800 hover:bg-emerald-50`
- Disable/Delete: rose outline button, `border border-rose-300 bg-white text-rose-700 hover:bg-rose-50`
- Use lucide icons where available and keep labels short enough for the action area.

9. Upgrade loading and empty states:

- Loading: centered `Loader2` with `animate-spin`, matching `DelegationModal`.
- Empty: bordered slate panel or table row with `font-semibold text-slate-500`.
- Add a user-facing error state for failed `fetchUsers()` instead of only logging to console.

10. Upgrade modals to match `DelegationModal`:

- Overlay: `fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[1px]`
- Modal frame: `w-full max-w-md border border-slate-200 bg-white shadow-2xl`
- Header: `flex items-start justify-between border-b border-slate-200 px-5 py-4`
- Modal title: `text-lg font-black text-slate-900`
- Metadata labels: `text-xs font-black uppercase tracking-[0.14em] text-slate-600`
- Inputs/selects: `mt-2 w-full border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-800`
- Footer: `flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4`
- Primary action: `bg-[#084C39] px-4 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-[#07362A]`
- Secondary action: `border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-700 hover:bg-slate-50`

11. Apply the same modal treatment to:

- Add/Register Staff modal
- Success modal
- Temporary Password modal
- Clinical Delete Warning modal

12. Preserve existing authorization rules:

- Super Admin can create/manage only `Admin` accounts.
- Barangay Admin can create/manage only `Midwife`, `Nurse`, and `BHW` accounts in their assigned barangay.
- Do not expose Super Admin account creation in the UI.

## Objective 3: Dashboard Backend Wiring

### Current Gap

`PublicHealthDashboard.jsx` is mounted under both Admin and Super Admin routes, but its backend widgets are Barangay Admin-centered:

- `server/routes/admin.js#getAssignedBarangayScope()` rejects users without `assigned_barangay`.
- `server/routes/admin.js#getAdminBarangayScope()` ignores `req.query.barangay` and `x-admin-barangay` for Super Admin.
- `GET /api/admin/dashboard/clusters`, `/audit-summary`, and `/user-summary` therefore fail for municipality-wide Super Admin use.
- Dashboard navigation points to `/admin/reports/m1`, `/admin/spatial-analysis`, `/admin/audit`, and `/admin/users` even when rendered from `/superadmin/dashboard`.
- Loading states are present, but errors are mostly console-only and then silently rendered as zeros/empty lists.

### Backend Implementation Strategy

1. Add a Super Admin-aware scope resolver in `server/routes/admin.js`:

```js
const getDashboardScope = async (req) => {
    if (req.user?.role === ROLES.SUPER_ADMIN) {
        const requestedBarangay = (req.query.barangay || req.headers['x-admin-barangay'] || '').trim();
        if (!requestedBarangay || requestedBarangay === 'all') {
            return { barangay: null, barangay_id: null, scope_type: 'MUNICIPAL' };
        }

        const [rows] = await db.execute(
            `SELECT id, name FROM barangays WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) LIMIT 1`,
            [requestedBarangay]
        );

        return {
            barangay: rows[0]?.name || requestedBarangay,
            barangay_id: rows[0]?.id || null,
            scope_type: 'BARANGAY'
        };
    }

    const scope = await getAdminBarangayScope(req);
    return { ...scope, scope_type: 'BARANGAY' };
};
```

2. Replace `getAdminBarangayScope(req)` with `getDashboardScope(req)` in:

- `GET /api/admin/dashboard/kpis`
- `GET /api/admin/dashboard/clusters`
- `GET /api/admin/dashboard/audit-summary`
- `GET /api/admin/dashboard/user-summary`
- `GET /api/admin/dashboard/trends`, if it remains in use

3. Update helper functions to accept `barangay = null`:

- `getDashboardKpis(barangay)`
- `getUserSummary(barangay)`
- `buildCoverageTrend(barangay)`, if retained

4. Add or repurpose a single live Super Admin endpoint to reduce frontend fan-out:

Preferred route:

```txt
GET /api/admin/dashboard/superadmin-summary?barangay=all|<barangay>
```

Response shape:

```js
{
  success: true,
  scope: { type: 'MUNICIPAL', barangay: null, barangay_id: null },
  generated_at: string,
  metrics: {
    total_registered_infants: number,
    active_bhws: number,
    active_midwives: number,
    active_barangay_admins: number,
    overall_nip_compliance_rate: number,
    active_hotspots: number,
    current_defaulters: number,
    pending_validations: number
  },
  hotspots: [],
  personnel: [],
  recent_audit_events: []
}
```

5. SQL queries for required live metrics:

Total Registered Infants:

```sql
SELECT COUNT(*)::int AS total_registered_infants
FROM infants
WHERE status = 'Active'
  AND registration_status = 'APPROVED'
  /* optional */ AND UPPER(TRIM(barangay)) = UPPER(TRIM($1));
```

Active BHWs:

```sql
SELECT COUNT(*)::int AS active_bhws
FROM users
WHERE role = 'BHW'
  AND is_active = TRUE
  /* optional */ AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM($1));
```

Active Midwives/Nurses:

```sql
SELECT COUNT(*)::int AS active_midwives
FROM users
WHERE role IN ('Midwife', 'Nurse')
  AND is_active = TRUE
  /* optional */ AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM($1));
```

Active Barangay Admins:

```sql
SELECT COUNT(*)::int AS active_barangay_admins
FROM users
WHERE role = 'Admin'
  AND is_active = TRUE
  /* optional */ AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM($1));
```

Pending Validations:

```sql
SELECT COUNT(*)::int AS pending_validations
FROM infant_registrations
WHERE status = 'PENDING_VALIDATION'
  /* optional */ AND UPPER(TRIM(barangay)) = UPPER(TRIM($1));
```

Current Defaulters:

```sql
SELECT COUNT(DISTINCT i.id)::int AS current_defaulters
FROM infants i
JOIN infant_schedules s ON s.infant_id = i.id
WHERE i.status = 'Active'
  AND s.status::text IN ('DEFAULTER', 'DEFAULTED', 'OVERDUE')
  /* optional */ AND UPPER(TRIM(i.barangay)) = UPPER(TRIM($1));
```

Overall NIP Compliance Rate:

Use the existing `M1ReportService.getCoverageDashboardForUser()` for official DOH-style coverage, then map `kpis.utilization_rate` or `kpis.final_dose_count / kpis.target_population`. If the dashboard label is “Overall NIP Compliance Rate,” define it explicitly as:

```js
overall_nip_compliance_rate = target_population > 0
  ? Number(((final_dose_count / target_population) * 100).toFixed(1))
  : 0;
```

This keeps the dashboard aligned with the existing monitoring chart target population definitions instead of inventing a new denominator from raw infant registry counts.

Active Hotspots:

Use `InfantService.getSpatialTriage({ barangay, eps: 300, minPts: 3, scope: 'defaulter' })`, then:

```js
active_hotspots = spatialData.clusters.length;
```

For page-load performance, use the existing `/api/dashboard/superadmin/spatial-overview` style lightweight grouping for municipality-wide mode if full DBSCAN is too slow.

6. Scope all queries consistently:

- Super Admin with no barangay or `all`: municipality-wide.
- Super Admin with selected barangay: scoped to selected barangay.
- Admin: always scoped to `req.user.assigned_barangay`; ignore any client-provided barangay override.

7. Audit summary:

`AuditLogService.getDashboardSummary({ user })` may already scope internally by user role. Confirm it returns municipality-wide events for Super Admin and barangay-scoped events for Admin. If not, add an explicit optional `barangay` parameter.

### Frontend Implementation Strategy

1. Update `PublicHealthDashboard.jsx` to detect Super Admin mode:

```js
const isSuperAdmin = sessionUser?.role === 'Super Admin';
const routePrefix = isSuperAdmin ? '/superadmin' : '/admin';
```

2. Replace hard-coded dashboard navigation:

- `/admin/reports/m1` -> `${routePrefix}/reports`
- `/admin/spatial-analysis` -> Super Admin should use `/superadmin/geospatial`; Admin should keep `/admin/spatial-analysis`
- `/admin/audit` -> `${routePrefix}/audit`
- `/admin/users` -> `${routePrefix}/users`

3. Replace the current Admin-specific dashboard title and scope copy when `isSuperAdmin`:

- Eyebrow: `IMMUNICARE Municipal Oversight`
- Title: `Super Admin Decision Support Dashboard`
- Scope: `RHU 2 - All Barangays` or selected barangay

4. Add section-level error state alongside loading state:

```js
const [errors, setErrors] = useState({
    kpis: '',
    clusters: '',
    audit: '',
    users: '',
    trends: ''
});
```

Render visible error panels using:

```jsx
<div role="alert" className="flex items-start gap-2 border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
    <span>{message}</span>
</div>
```

5. Replace textual loading placeholders like `...` with `Loader2` for card-level loading:

```jsx
{loading.kpis ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : card.value}
```

6. If adding `GET /api/admin/dashboard/superadmin-summary`, use it for the top Super Admin KPI cards and keep the existing report/cluster/audit/user endpoints only for detailed sections. This makes the required metrics explicit:

- Total Registered Infants
- Active BHWs
- Overall NIP Compliance Rate
- Active Hotspots

7. Keep `GET /api/reports/coverage-dashboard` for trend chart data because it already reflects official M1 monitoring chart logic and supports Super Admin municipality mode.

## Validation Plan

1. Backend verification:

- Super Admin, no selected barangay: dashboard summary returns municipality-wide totals.
- Super Admin, selected barangay: dashboard summary returns that barangay only.
- Barangay Admin: dashboard ignores query/header override and remains scoped to assigned barangay.
- Unauthorized roles receive 403.

2. Frontend verification:

- `/superadmin/dashboard` renders without silent zero-state failures when no barangay is selected.
- Changing the Super Admin global barangay filter refreshes dashboard metrics.
- Dashboard buttons route to `/superadmin/*` pages in Super Admin mode.
- Loading uses `Loader2`; backend failures show visible clinical error panels.
- Sidebar expanded/collapsed states keep content centered.

3. UI regression checks:

- `/superadmin/users`
- `/superadmin/targets`
- `/superadmin/dashboard`
- `/admin/users`
- `/admin/dashboard`

4. Test commands to run during execution phase:

```bash
npm test -- --runInBand server/tests/superadmin_dashboard.test.js
cd client && npm test -- UserManagement
cd client && npm run build
```

If no targeted frontend test exists, perform a Vite build plus manual browser verification for the Super Admin routes.

## Execution Order

1. Implement global layout centering in `SuperAdminLayout.jsx` and, if safe, `AdminLayout.jsx`.
2. Normalize page-level wrappers affected by the new layout container.
3. Refactor `UserManagement.jsx` visual structure and modal styling without changing authorization behavior.
4. Add Super Admin-aware backend dashboard scope resolution and live metric aggregation.
5. Update `PublicHealthDashboard.jsx` to use Super Admin route prefixes, explicit live metric cards, `Loader2` loading states, and visible error states.
6. Add backend tests for dashboard scoping and metric aggregation.
7. Build and manually verify Super Admin desktop/mobile layouts.

## Risks And Mitigations

- Risk: Existing Admin pages may already include their own padding, causing double padding after layout centering.
  Mitigation: adjust only the page roots that visibly double-pad and keep table-level horizontal scroll containers.

- Risk: Municipality-wide DBSCAN can be expensive on dashboard load.
  Mitigation: use lightweight grouped hotspot overview for KPI counts and reserve full DBSCAN for the geospatial page or explicit refresh.

- Risk: “Compliance rate” can be interpreted multiple ways.
  Mitigation: define dashboard compliance using M1 monitoring chart target population and final-dose count, and label helper text accordingly.

- Risk: Super Admin and Admin share `PublicHealthDashboard.jsx`.
  Mitigation: branch route labels, route destinations, and scope labels by `sessionUser.role` while preserving Admin behavior.

## Halt Condition

This plan is ready for review. No application code changes should be made until explicit authorization is given for the execution phase.
