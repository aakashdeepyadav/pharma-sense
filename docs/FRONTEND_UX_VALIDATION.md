# Frontend UX Validation

Date: 2026-10-03 | Branch: `feature/frontend-ux`

## Change

Added responsive and keyboard browser checks for the admin audit controls at 320px and 768px, and for the medicine form. The audit check verifies visibility, viewport bounds, no page-level horizontal overflow, and keyboard order from search through Search and Export CSV. The medicine form is now a named modal dialog: focus enters the first field, Tab wraps at the dialog boundaries, Escape closes it, and focus returns to the opener. Fixtures include an audit row and category so the tested actions are enabled.

The sign-in screen now uses compact product identity and restrained feature rows; the dashboard shell uses tighter spacing, subtle borders, and flatter surfaces. Manual visual review covered 1440px desktop and 390px phone widths.

## Validation

- `npm run lint` passed.
- `npm run build` passed.
- `npm run test:e2e` passed: 9 tests, including login, role visibility, admin user form, responsive dashboard controls, and medicine-dialog keyboard behavior.
- Vite started at `http://127.0.0.1:4173/`.
- The live workflow in `frontend/e2e-live/inventory-workflow.spec.ts` covers medicine creation, purchase receiving, stock issue, and alert acknowledgement using the seeded Admin. It now also signs in as a created Pharmacist, checks role-limited controls, and verifies that the real API rejects supplier creation with `403`. The workflow was not run locally because Docker is unavailable; CI must validate this latest test change.

## Impact

- No backend, API, schema, or migration changes.
- No production security behavior changed; the addition is browser-test fixture and coverage only.
- `VITE_API_URL` usage is unchanged.

## Demo Script

1. Start the database, backend, and frontend using the repository Quick Start.
2. Sign in as the seeded Admin, create a medicine, and receive a purchase for it.
3. Issue stock, then acknowledge its low-stock alert.
4. Open Management and history and verify the audit record; repeat sign-in as Staff to verify management actions are hidden.
5. Open Add Medicine using the keyboard, check dialog focus and Escape dismissal, then open Management and history and use Tab through audit search and its available actions at a narrow width.

The live API steps above require a working local PostgreSQL/Docker setup; the committed live browser workflow is the automated evidence for those steps.