# Security and reliability fixes

Based on commit `7ecb785e05978de788e5302da693e86b8bac897b`. Changes are local; GitHub and deployed services have not been updated.

## Changes

- Tracking endpoints require login and use the authenticated user/company. Coordinates accept zero and reject invalid ranges. Sessions are stored in MongoDB with a one-minute inactivity expiry; active queries exclude expired entries even before TTL cleanup.
- Users can start/update/stop only their own session. Company members can view active sessions within their company.
- Authentication rejects absent/default/short JWT secrets and reloads current user/company/role from the database. Deleted users and tokens invalidated by password changes are denied access.
- Vehicle owners must belong to the company. Populated owners are company-filtered, including older records. Members with assigned vehicles cannot be removed without removing/reassigning those vehicles.
- Member, vehicle and contact values render as text, eliminating stored HTML/script execution through those tables.
- Emergency creation distinguishes saving an alert from email acceptance/failure. It never claims emergency responders were contacted or dispatched. Email descriptions are escaped; raw Gmail headers reject line breaks.
- Active emergencies load after login/reload, and resolving them persists on the server. Failed save/resolve requests are visible. Duplicate in-flight clicks are suppressed.
- Logout clears account state, stops local tracking, removes the map and ignores late location responses. Failed location requests clear stale coordinates.
- Missing phone/invalid credential inputs are rejected before company creation or database credential queries.
- Removed fake example personal contacts and placeholder roadside numbers. The legacy tracker page redirects to the main app; its embedded Google Maps key was removed.
- Repaired the lock file, added start/dev/test commands, corrected the Gmail environment example, and updated affected dependencies (including Google APIs 178.0.0).

## Setup / migration

Tested with Node.js 20.20.2. From `backend`: run `npm ci`, configure `.env` using `.env.example`, then run `npm test` and `npm start`.

- `JWT_SECRET` must be a unique random value with at least 32 characters. There is no default. Changing it logs out existing users. The server refuses to start with the old example value.
- Set `MONGO_URI`, frontend `CORS_ORIGIN`, and `FRONTEND_URL` correctly.
- Email uses `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, and `GMAIL_USER`. SMTP `EMAIL_*` variables are not used by this app.
- Serve `Frontend/` over HTTP(S). On localhost the UI uses port 5000 for its API; the original hosted API URL remains unchanged for non-local deployments.
- MongoDB should create the new TrackingSession unique and TTL indexes. If automatic index creation is disabled, provision those indexes before enabling API tracking.
- Review old cross-company vehicle-owner references; the updated API conceals foreign owners but does not rewrite historical records.
- Restrict/rotate the Google Maps key that was published in the old `Frontend/new.html`. Removing current source does not revoke the key or erase Git history. Follow https://developers.google.com/maps/api-security-best-practices .

## Verification and limits

Tests exercise Express routes, JWT permissions, password hashing, tenant scoping, notification failure, header validation and frontend state/rendering with synthetic data and mocked persistence/provider calls. No real alert, email or emergency-service call was sent.

The UI's Start Local Tracking button updates only this browser; it does not publish positions to the tracking API or implement shared fleet tracking. Personal contacts are saved in the authenticated user’s MongoDB document and reload after login. Emergency-service contact lists are general regional references, not verified nearest responders. This app does not dispatch emergency services.

Live MongoDB persistence, TTL/index provisioning, Gmail OAuth delivery and deployment configuration still need staging verification. Configure trusted proxies correctly for the built-in request limits, and add operational monitoring before public operation. A clean dependency audit is not a full security certification.


## Second-round fixes (2026-09-20)

Shared request limits now use atomic MongoDB counters, so restarts or multiple API instances do not reset the budget. Authentication allows 100 attempts/IP/15 minutes and 10 attempts/account/15 minutes; reset-email requests allow 3/account/15 minutes. Kissan normalizes login emails before counting the account budget. Notification endpoints allow 30 requests/account/15 minutes and 100/IP/15 minutes where applied, with at most 20 recipients per explicit email/bulk send. Kissan public contact forms allow 5/IP/15 minutes. Rejected requests return 429 with Retry-After; unavailable counter storage returns 503 rather than silently disabling protection.

`TRUST_PROXY_HOPS` defaults to 0. Set it only to the exact number of trusted reverse proxies in your deployment. Do not blindly enable trust for arbitrary forwarded headers. Ensure the RequestLimit collection's TTL index on expiresAt is created if automatic indexes are disabled. Counters hash their identifiers instead of retaining plain email/IP values.

The transaction-backed operations below require **MongoDB Atlas or a replica set**. Standalone MongoDB is no longer sufficient for these operations; there is no unsafe partial-write fallback.

Run `npm test` for isolated regressions. For real database tests, set TEST_MONGO_URI to an isolated localhost MongoDB replica set URI and run `npm run test:integration`. The test suite creates a random test database and removes that database afterward. It rejects non-local URIs to avoid accidentally targeting a production server.

Company registration creates the company and first user in one transaction. A validation failure or duplicate email rolls back the company record as well.

Personal contacts use /api/contacts with authenticated user/company scoping. Add/delete operations persist before the interface reports success. Duplicate phone entries and more than 100 contacts per account are rejected atomically. Failed saves/deletes leave the displayed contacts intact. Existing in-memory entries from the old app cannot be recovered after they have already been lost.


# Updated projects — version 3

Use Kissan-app-fixed-v3.zip and vehicle-management-system-fixed-v3.zip. They include all previous fixes and the six additional fixes from the latest review. GitHub and deployed services have not been changed.

## New fixes

1. Vehicle fleet changes (add/update/delete members, add/delete vehicles) and emergency resolution require a company admin. Regular members retain read access, tracking, contacts and emergency reporting.
2. Kissan validates positive farm/crop areas, nonnegative crop yields and coordinate ranges at the database schema layer, covering creation and edits. Invalid edits return 400 without saving.
3. New bookings require an active farm belonging to the farmer. Deactivated farms cannot receive new bookings; existing appointments remain intact.
4. Vehicle creation and owner deletion use transactions that both write the owner record. Concurrent operations retry safely and cannot leave a vehicle referencing a deleted owner.
5. Vehicle years must be whole numbers from 1886 through next year. Plates are uppercased with whitespace removed, with a 32-character maximum and company-specific uniqueness. Invalid input returns 400; duplicate-key races return 409.
6. Kissan AI endpoints share a quota of 10 requests per account per 15-minute window. Harvest dates must be real ISO calendar dates between sowing and 730 days after sowing. Unsupported AI dates return 502 and do not overwrite the saved date. This broad two-year boundary is a consistency check, not agronomic validation for every crop.

## Verification

45 tests passed: 14 Kissan isolated tests, 18 vehicle isolated/frontend tests, and 13 tests against a temporary local MongoDB replica set. Checks cover member permissions, invalid data, deactivated-farm bookings, AI date rejection, plate normalization and 12 simultaneous owner-deletion/vehicle-creation trials, plus the previous regression cases. JavaScript syntax, whitespace and ZIP integrity were also checked. No live AI, email or production database was used. Frontends are unchanged from version 2.

## Deployment steps

Read each archive's FIXES.md and preserve private environment settings. Install dependencies using npm ci and run npm test from each backend. Integration tests use TEST_MONGO_URI pointing to an isolated localhost replica set and npm run test:integration; they create and remove a random test database.

MongoDB Atlas or a replica set is required for vehicle registration, vehicle creation, owner deletion and Kissan bulk-route operations. Provision the declared unique and TTL indexes if automatic index creation is disabled.

For an existing vehicle database, stop API writes and back up the database before enabling the new version. In the vehicle backend, configure MONGO_URI, then run:

    node scripts/normalize-plates.js

This only reports changes and conflicting/invalid record IDs. Resolve reported conflicts by checking the real vehicle records; the script never merges or deletes vehicles. Once the report is clean, apply normalization while API writes remain stopped:

    node scripts/normalize-plates.js --apply

The updates commit together in a transaction. Restart with the new API afterward. This migration has not been run against your production data. Existing invalid vehicle years or Kissan farm/crop values are not automatically rewritten and should be reviewed separately.

Earlier setup requirements still apply: explicit government-account approval, a unique vehicle JWT secret of at least 32 characters, Node.js 20.9+ for Kissan's frontend, correctly configured Gmail OAuth, review of the Maps key exposed in the old vehicle demo, and an exact TRUST_PROXY_HOPS setting if behind trusted reverse proxies.

Search/pagination, audit history, notification queues, multilingual/offline features and deployment/backup automation remain separate feature work. These packages address the six reviewed faults, not those larger enhancements. Payment records do not independently verify bank transfers; emergency alerts do not dispatch responders.
