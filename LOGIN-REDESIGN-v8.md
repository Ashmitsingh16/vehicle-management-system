# Vehicle login redesign — v8

The supplied reference file was a third-party Visme workshop registration embed. Version 8 recreates its animated presentation as a native Vehicle Management login experience while preserving the real application authentication flows.

## Included

- Responsive split-screen login with an animated vehicle scene.
- Reduced-motion support.
- Existing login, company registration, password reset and session handling.
- Clear loading states, inline errors, status announcements and Enter-key submission.
- Client-side required field and email validation aligned with the API.
- No dependency on Visme or its external form content.

## Verification

- All 24 Vehicle backend and frontend tests passed.
- JavaScript syntax and required login markup checks passed.
- The running local API successfully authenticated the demo administrator account.
- The live Atlas staging workflow had already passed 15 API checks.

Local preview: http://localhost:5500

Test login: `admin@example.com` / `LocalDemo2026!`
