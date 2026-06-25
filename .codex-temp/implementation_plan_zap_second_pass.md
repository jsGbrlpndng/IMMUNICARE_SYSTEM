# Second-Pass ZAP Remediation Plan

## 1. Executive Summary

The latest ZAP report still shows Medium and Low alerts primarily because it was not a clean scan of the production static build. The report evidence points to the Vite development server at `http://localhost:5173/`, not the production build served by `client/serve-local.cjs`.

The strongest indicators are:

- The CSP evidence contains `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, which matches `client/vite.config.js` development headers.
- The CSP evidence contains `connect-src 'self' ws://127.0.0.1:5173`, which is Vite HMR WebSocket traffic.
- The report includes `/@react-refresh`, which only exists in Vite development mode.
- The report includes `/node_modules/.vite/deps/...`, which are Vite pre-bundled development dependency paths.
- The ZAP Sites list includes Google/Chrome service origins such as `optimizationguide-pa.googleapis.com`, `content-autofill.googleapis.com`, `android.clients.google.com`, `passwordsleakcheck-pa.googleapis.com`, and `www.googleapis.com`.

Current classification:

- Real remaining IMMUNICARE production issues: no confirmed Medium issue from this report. One possible residual issue remains: production `style-src 'unsafe-inline'` is currently present in `client/serve-local.cjs` and may be needed because the app uses React inline style objects, runtime injected style blocks, Leaflet map HTML, and chart/map libraries.
- Vite dev-server findings: CSP `unsafe-eval`, CSP `script-src unsafe-inline`, Vite `style-src unsafe-inline` evidence, Private IP Disclosure in `/node_modules/.vite/deps/xlsx.js`, Timestamp Disclosure in `/node_modules/.vite/deps/jspdf.js`, `/@react-refresh`, and `/src/...` files.
- External Google/Chrome traffic: CSP header missing, anti-clickjacking missing, HSTS missing, X-Content-Type-Options missing, and some timestamp disclosures on Google/Chrome endpoints.
- ZAP scope/setup problems: external browser background services and Vite development server paths were included in the scan.
- Acceptable residual risks: temporarily keeping `style-src 'unsafe-inline'` in production may be acceptable if removing it breaks maps, charts, exported report rendering, or runtime library styling. This must be explicitly tested before changing.

## 2. Alert Classification Table

| Alert name | Risk | URL from ZAP report | Evidence from ZAP report | Classification | Code change needed | Scan-scope correction needed | Recommended safe action |
|---|---:|---|---|---|---|---|---|
| CSP: script-src unsafe-eval | Medium | `http://localhost:5173/` | `script-src 'self' 'unsafe-inline' 'unsafe-eval'`; `connect-src 'self' ws://127.0.0.1:5173` | Vite dev artifact / scan configuration issue | No production code change confirmed | Yes | Re-run against `client/serve-local.cjs`. Production CSP in `serve-local.cjs` does not include `unsafe-eval`. |
| CSP: script-src unsafe-inline | Medium | `http://localhost:5173/` | `script-src 'self' 'unsafe-inline' 'unsafe-eval'` | Vite dev artifact / scan configuration issue | No production code change confirmed | Yes | Re-run production scan. Existing `client/dist/index.html` uses external module script `/assets/index-BcfNke69.js`, not inline script. |
| CSP: style-src unsafe-inline | Medium | `http://localhost:5173/` | `style-src 'self' 'unsafe-inline'` | Accepted residual risk until tested in production | Maybe | Yes | Keep temporarily unless full UI verification proves removal is safe. Investigate React inline styles, runtime `<style>` blocks, Leaflet, Recharts, and export rendering before removal. |
| Content Security Policy (CSP) Header Not Set | Medium | `https://optimizationguide-pa.googleapis.com/downloads?...` | Empty CSP evidence on external Google endpoint | External domain noise | No | Yes | Exclude Google/Chrome background service URLs. Do not change IMMUNICARE code for this finding. |
| Missing Anti-clickjacking Header | Medium | `https://optimizationguide-pa.googleapis.com/downloads?...` | Parameter `x-frame-options`, empty evidence on external Google endpoint | External domain noise | No | Yes | Exclude external domains. IMMUNICARE `serve-local.cjs` sets `X-Frame-Options: DENY`; backend Helmet also sets frameguard deny. |
| Private IP Disclosure | Low | `http://localhost:5173/node_modules/.vite/deps/xlsx.js?v=8bd1dc2c` | `10.4.6.2` | Vite dev artifact / third-party dependency noise | No production code change confirmed | Yes | Re-test production `dist`. If the same value appears in `dist/assets`, classify as bundled third-party library noise unless it exposes IMMUNICARE infrastructure. |
| Strict-Transport-Security Header Not Set | Low | `https://content-autofill.googleapis.com/...`, `https://android.clients.google.com/...`, `https://passwordsleakcheck-pa.googleapis.com/...`, `https://www.googleapis.com/...` | Empty HSTS evidence on external Google/Chrome endpoints | External domain noise | No | Yes | Exclude external domains. Do not enable HSTS on local HTTP. Backend already gates HSTS behind `NODE_ENV=production` and `HTTPS_ENABLED=true`. |
| Timestamp Disclosure - Unix | Low | `http://localhost:5173/node_modules/.vite/deps/jspdf.js?v=8bd1dc2c`; `https://optimizationguide-pa.googleapis.com/v1:GetModels?...` | `1473231341`, evaluates to `2016-09-07 14:55:41` | Vite dev artifact and external domain noise | No production code change confirmed | Yes | Re-test production `dist`. If found in production bundle, document as third-party jsPDF/library metadata unless it reveals IMMUNICARE data. |
| X-Content-Type-Options Header Missing | Low | `https://optimizationguide-pa.googleapis.com/downloads?...` | Parameter `x-content-type-options`, empty evidence on external Google endpoint | External domain noise | No | Yes | Exclude external domains. IMMUNICARE `serve-local.cjs` sets `X-Content-Type-Options: nosniff`; backend Helmet also sets it. |

## 3. Production CSP Audit

Files inspected:

- `client/serve-local.cjs`
- `client/vite.config.js`
- `client/index.html`
- `client/dist/index.html`
- `client/dist/assets/*`
- `client/src/*` where inline styles or runtime style injection were relevant
- `server/server.js`

Development CSP:

`client/vite.config.js` defines development-only headers for the Vite server. It includes:

```text
script-src 'self' 'unsafe-inline' 'unsafe-eval'
style-src 'self' 'unsafe-inline'
connect-src 'self' ws://127.0.0.1:5173
```

This exactly matches the ZAP CSP evidence. `unsafe-eval` and the WebSocket source are for Vite HMR and React Refresh, not production.

Production/static CSP:

`client/serve-local.cjs` defines `PRODUCTION_CSP` and applies it to HTML responses from the static `dist` server. It currently includes:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://server.arcgisonline.com https://*.cartocdn.com;
connect-src 'self';
font-src 'self';
worker-src blob:;
child-src blob:;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self'
```

Production CSP findings:

- Production CSP does not contain `unsafe-eval`.
- Production CSP does not contain `unsafe-inline` in `script-src`.
- Production CSP does contain `unsafe-inline` in `style-src`.
- Existing `client/dist/index.html` has no inline `<script>` block and no inline `<style>` block. It loads `/assets/index-BcfNke69.js` and `/assets/index-2833Wlh5.css`.
- `client/index.html` has only the normal Vite module entry script: `<script type="module" src="/src/main.jsx"></script>`.
- The ZAP inline script evidence contains `import { injectIntoGlobalHook } from "/@react-refresh";`, proving that specific inline script is from Vite React Refresh, not production `dist`.
- Existing `client/dist` has no `/node_modules/.vite`, `@react-refresh`, or `.vite` paths.
- No Google Fonts requests were found in `client/src`, `client/dist`, or `server`; `client/src/main.jsx` documents self-hosted fonts.

Does production need `unsafe-eval`?

No evidence shows a production need. It should remain absent from `client/serve-local.cjs` and exist only in Vite development headers.

Does production need `script-src 'unsafe-inline'`?

No evidence shows a production need. Existing production HTML uses an external module script. Do not add `unsafe-inline` to production `script-src`.

Does production need `style-src 'unsafe-inline'`?

Possibly. The app uses many React `style={{ ... }}` attributes, plus runtime style blocks and injected HTML in areas such as:

- `client/src/pages/clinical/HeatmapMap.jsx`
- `client/src/pages/clinical/InfantRegistrationForm.jsx`
- `client/src/pages/clinical/ValidationPage.jsx`
- `client/src/components/caregiver/DigitalImmunizationCard.jsx`
- `client/src/components/M1SectionCReport.jsx`
- map marker/popup HTML and Leaflet styling
- Recharts/chart rendering
- report/PDF/export rendering paths

Removing `style-src 'unsafe-inline'` without a full browser regression pass is high risk. The safest production CSP for the next ZAP retest is the current `serve-local.cjs` CSP, with `script-src 'self'` and no `unsafe-eval`, while keeping `style-src 'self' 'unsafe-inline'` as a documented residual risk until tested.

Safest production CSP for this pass:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://server.arcgisonline.com https://*.cartocdn.com;
connect-src 'self';
font-src 'self';
worker-src blob:;
child-src blob:;
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self'
```

## 4. Proposed Safe Fixes

Only these changes should be considered after approval:

1. Do not change production `script-src`; keep it as `script-src 'self'`.
2. Do not add or keep `unsafe-eval` in production CSP.
3. Keep Vite-only allowances only in `client/vite.config.js`: `unsafe-eval`, dev `unsafe-inline`, and `ws://127.0.0.1:5173`.
4. Keep production `style-src 'self' 'unsafe-inline'` temporarily unless a full manual and automated verification pass proves it can be removed safely.
5. If reducing style CSP later, first inventory runtime style usage and test maps, Leaflet popups, Recharts charts, dashboards, report rendering, and exports in a browser with CSP enforcement enabled.
6. Confirm `X-Frame-Options: DENY` and `frame-ancestors 'none'` remain present on IMMUNICARE-owned HTML responses from `serve-local.cjs`.
7. Confirm `X-Content-Type-Options: nosniff` remains present on IMMUNICARE-owned HTML/static responses and backend API responses.
8. Do not try to fix Google/Chrome external URLs in IMMUNICARE code.
9. Do not enable HSTS on local HTTP. Keep HSTS gated for real production HTTPS only.
10. Do not rewrite authentication, authorization, database, DBSCAN, clinical logic, CORS policy, or map providers as part of this pass.

No immediate code fix is recommended before a corrected ZAP retest, because the report does not prove the production static server is affected by the Medium CSP script findings.

## 5. Correct ZAP Re-Test Plan

1. Stop the Vite dev server.
2. Build and serve the frontend production bundle:

```powershell
cd client
npm run build
node serve-local.cjs
```

3. Confirm `http://127.0.0.1:5173` is being served by `client/serve-local.cjs`, not Vite.
4. Start the backend normally:

```powershell
cd server
node server.js
```

5. Configure ZAP scope to include only:

```text
http://127.0.0.1:5173
http://localhost:5173
http://127.0.0.1:3000
http://localhost:3000
```

6. Exclude external domains:

```text
.*googleapis\.com.*
.*gstatic\.com.*
.*google\.com.*
.*android\.clients\.google\.com.*
.*passwordsleakcheck-pa\.googleapis\.com.*
.*optimizationguide-pa\.googleapis\.com.*
.*content-autofill\.googleapis\.com.*
.*cartocdn\.com.*
.*arcgisonline\.com.*
```

7. Exclude Vite dev-only paths if they appear:

```text
.*/node_modules/\.vite/.*
.*/@react-refresh.*
```

8. Use a clean browser profile or ZAP browser with Chrome background services disabled where possible.
9. Before generating the final report, confirm the ZAP Sites tree contains only IMMUNICARE-owned origins.
10. If `/@react-refresh`, `/node_modules/.vite/`, `/src/main.jsx`, or `ws://127.0.0.1:5173` appear again, discard the report as a dev-server scan.

## 6. Verification Plan

Before implementation is considered complete:

1. Backend tests pass.
2. Frontend tests pass.
3. Client build passes.
4. Production static server starts.
5. Browser console has no CSP errors.
6. Login works.
7. BHW dashboard works.
8. Midwife dashboard works.
9. Infant registry works.
10. Patient record works.
11. Register infant form works.
12. Map / heatmap / priority areas load map tiles.
13. Reports load.
14. PDF/XLS/CSV exports download successfully.
15. Caregiver OTP portal works.
16. No Google Fonts requests remain.
17. No Vite dev paths appear in production ZAP scan.

## 7. Risk Control

Do not make high-risk changes without separate approval.

High-risk changes include:

- Removing `style-src 'unsafe-inline'` without confirming maps/charts still work.
- Changing authentication token storage.
- Changing CORS to wildcard.
- Enabling HSTS on localhost.
- Removing map providers.
- Changing DBSCAN or clinical logic.
- Changing API route behavior.
- Modifying database schema.

## 8. Approval Gate

"Second-pass ZAP remediation plan is ready. No code has been changed yet. Waiting for approval before implementation."
