# Release v7 status — 23 September 2026

This source includes all fixes through v7. It has not been deployed or pushed to GitHub.

## Verification completed

- 24 isolated and frontend tests passed.
- 7 shared integration tests passed against a disposable local replica set.
- Gmail OAuth is configured privately for local use, and the user confirmed receipt of an emergency email.
- The Atlas account `vehicle_staging_app` connects with `readWrite` access limited to `vehicle_staging` on the `eme` cluster.
- Fifteen live staging API checks passed using synthetic records: transactional registration, login, authentication rejection, members, vehicles, contacts, role restrictions, deletion guards and company isolation.

## Required before public deployment

- Choose HTTPS frontend and backend hosting URLs, then configure `FRONTEND_URL`, `CORS_ORIGIN` and the public frontend API URL.
- Configure unique production `JWT_SECRET`, private `MONGO_URI` and Gmail OAuth values in the hosting secret manager.
- Move the Google OAuth app out of external Testing and obtain a suitable fresh refresh token before launch; testing-mode refresh tokens are short-lived.
- Restrict Atlas Network Access to the chosen hosting provider's outbound addresses or private connection before launch. The project currently permits `0.0.0.0/0`.
- Remove synthetic staging records if a clean staging database is desired, then test GPS from a physical device and complete a browser walkthrough.

The database password previously posted in chat should be rotated before public deployment.
