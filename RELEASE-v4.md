# Version 4 — code changes and final setup

Use the v4 source ZIPs. These include all earlier fixes. Nothing has been pushed to GitHub, deployed, or applied to your existing MongoDB database.

## Completed code work

- Added Kissan farm details, edit and crop-management pages. Farmers can save farm changes, add crops and update crop status. Owner authorization remains enforced by the API.
- Added the missing farmer appointment-details page, with status, recorded payment information and cancellation for eligible appointments.
- Farm creation now preserves zero-valued coordinates and omits an empty optional postcode.
- Vehicle section switching explicitly updates the selected tab, without relying on the implicit browser event global. Vehicles, Contacts and Users navigation worked in the browser walkthrough; the earlier navigation failure was not reproducible in the subsequent check.
- Removed the hardcoded Render API address. Vehicle Frontend/config.js accepts the deployment API URL; when empty it uses localhost:5000 locally or same-origin /api in production.
- Replaced the retired Gemini SDK usage with the documented REST endpoint, an API-key header, a 30-second timeout, JSON response requests and controlled errors. GEMINI_MODEL is configurable and defaults to gemini-3.1-flash-lite. Missing credentials return an unavailable-service response rather than attempting an unauthenticated provider call.
- Separated Google Maps server and browser keys. The frontend key endpoint returns only GOOGLE_MAPS_BROWSER_KEY, never GOOGLE_MAPS_API_KEY.
- Production startup rejects missing core configuration, short/placeholder JWT secrets, demo mode and invalid/non-HTTPS frontend origins. Kissan CORS now follows configured allowed origins. Example Kissan demo flags default to false.
- Unconfigured SMS no longer reports a successful mock delivery.
- Included scripts/check-config.js in each backend. It validates required settings, reports missing service credential names, never prints secret values and never contacts a database/provider.

## Verification and limits

49 tests passed: 17 Kissan isolated tests, 19 vehicle isolated/frontend tests and 13 integration tests against a temporary local MongoDB replica set. The Kissan production build passed and generated all 28 pages/routes, including the four new pages.

Browser checks confirmed farm details, a saved farm rename, crop creation, a saved crop status update, appointment details and vehicle navigation across Vehicles, Contacts and Users. These writes used synthetic local demo data only.

The preview restart was rejected by automatic approval review because a usage limit was reached. Consequently, browser checks used the current frontend against the already-running previous backend. Latest backend changes passed automated tests, but an integrated walkthrough after restart remains outstanding. The dev preview may still use the explicit demo-mode override from its launcher; the production examples do not.

This is ready for the next staging verification step, not a blanket production-readiness certification. Live Gemini/weather/maps/email/SMS, physical-device location, hosting/network behavior, and final complete workflows still need checking with your configuration. Larger enhancements such as audit history, search/pagination, delivery queues and multilingual/offline support are separate feature work.

## Your final setup

1. Choose the frontend/backend hosting URLs. Use Node.js 22 or later for Kissan's backend and a compatible Node release for its Next.js frontend. Install dependencies from each package with npm ci.
2. Use a separate staging database first. Set Kissan MONGODB_URI and vehicle MONGO_URI. MongoDB Atlas or a replica set is required for transactions. Configure declared unique and TTL indexes if automatic index creation is disabled.
3. Give each backend a different random JWT_SECRET of at least 32 characters. Set NODE_ENV=production, FRONTEND_URL to its HTTPS frontend origin, and CORS_ORIGIN to its allowed HTTPS origins separated by commas. Set TRUST_PROXY_HOPS only to the exact trusted reverse-proxy count. Kissan DEMO_MODE and NEXT_PUBLIC_DEMO_MODE must be false for production. Keep all demo accounts out of production.
4. Kissan frontend: set NEXT_PUBLIC_API_URL to the HTTPS backend URL ending in /api before building. If omitted in production, same-origin /api must be reverse-proxied to the backend. Configure FRONTEND_URL correctly so password-reset links return to the deployed frontend.
5. Vehicle frontend: set apiUrl in Frontend/config.js to its HTTPS backend URL ending in /api, or configure a same-origin /api reverse proxy. This setting is public and must never contain a secret.
6. Configure Kissan services privately: GEMINI_API_KEY and GEMINI_MODEL; OPENWEATHER_API_KEY; GOOGLE_MAPS_API_KEY for backend services; separate GOOGLE_MAPS_BROWSER_KEY restricted to the frontend origins and required browser APIs; SUPPORT_EMAIL and EMAIL_PASSWORD (Gmail app password for the current SMTP implementation). Optional SMS uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER. Verify SMTP is supported by the chosen host.
7. Vehicle email uses GMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN. It does not use your normal Gmail password.
8. Run node scripts/check-config.js from each backend. A structurally valid setting or present credential still requires a live test. Optional unconfigured services should stay disabled or be treated as unavailable.
9. Before updating an existing vehicle database, back it up and stop writes. Run node scripts/normalize-plates.js for a read-only report. Resolve duplicate/invalid plates before running the --apply variant. The migration has not been run on your production data. Review previously invalid farm/crop/year values separately.
10. After restarting with the latest backend and adding staging credentials, verify registration/login, both roles, farm create/edit/crops, booking/cancellation, officer verification/dispatch/collection/payment recording, route operations, member/vehicle/contact changes, emergency save/resolve, password reset, notifications, AI/weather/maps and location from your device. Use test recipients and synthetic records. Then make the production deployment decision.

Keep API secrets and database connection strings in private environment files or hosting secret settings, never in frontend config, Git commits or chat. No personal account password is required for code review.

## Local previews

Kissan: http://localhost:3100 — farmer@example.com or officer@example.com (Officer tab).
Vehicle: http://localhost:5500 — admin@example.com or driver@example.com.
Demo password: LocalDemo2026!

The existing preview uses disposable databases. When restart becomes available, stop its existing runner before starting node work/local-preview/start.cjs from this workspace. This launcher recreates synthetic data and is not part of either production source ZIP.

## AI reference

The model and REST request structure were checked against Google's official documentation:
https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
https://ai.google.dev/api

Actual provider access, output quality and account billing/quota remain unverified without your credentials.
