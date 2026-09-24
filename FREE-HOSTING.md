# Free testing deployment

Prepared 2026-09-24. No hosting resources have been provisioned by these files.

## Setup order

1. Sign in to Render and import this repository as a Blueprint using `render.yaml`. Review the resource list: backend plan must be **free**. Automatic deploys are off; no paid database or disk is declared. Authorizing Render's GitHub connection is an owner action.
2. Use your Atlas free cluster if available, with a separate restricted application database/user. Rotate the exposed password first. Add only the necessary hosting outbound addresses to Atlas. Save the connection URI in the backend environment, never Git.
3. Render prompts for secret and URL values. Use actual allocated URLs; do not assume the service name is the final hostname. Initial service startup may fail until the URLs, proxy count and credentials are complete. Set FRONTEND_URL and CORS_ORIGIN to the actual frontend HTTPS origin. Set TRUST_PROXY_HOPS after checking the host's real proxy path. Never leave invented example URLs in a live service.
4. The Blueprint also creates the static frontend. Set `API_URL` to the actual backend HTTPS URL plus `/api`. Only `dist/` is published; the build generates the public API configuration without editing your local preview.
5. Set the missing backend credentials and run the configuration check with deployment settings. Gmail must use an authorized refresh token and the sender it belongs to. This setup does not obtain or publish your private credentials automatically.
6. Trigger a manual deploy after saving settings, then complete the live checklist in DEPLOYMENT.md. Confirm database readiness, cross-account restrictions, password resets and email receipt using your own test accounts.

## Free-plan limits

- Render free backends sleep after inactivity. Two backends share the workspace's 750 monthly free instance hours; both cannot run continuously all month on that allowance. Limits can suspend services. Do not add paid upgrades or a payment method merely to bypass limits; review spend controls if a card already exists.
- Render free blocks SMTP. Vehicle already uses Gmail HTTPS; Kissan now supports `EMAIL_PROVIDER=gmail-api` for notifications, password reset and support. EMAIL_PASSWORD is not used in this mode. SUPPORT_EMAIL is still the support destination; GMAIL_USER is the authorized sender.
- Gmail and other providers have quotas and authorization requirements. Twilio SMS is not included as a permanently free service; leave it unconfigured unless you intentionally arrange service. AI, weather and Maps credentials still require their providers' setup, quotas and any applicable billing terms. This template cannot promise all third-party features at unlimited zero cost.
- No custom domain purchase is needed: use provider subdomains. No managed backup or always-on guarantee is included. Arrange a recoverable backup before storing real user data.
- This is a free personal/demo setup, not dependable emergency infrastructure or a verified commercial production deployment.

Official references: [Render free limits](https://render.com/docs/free), [Render Blueprint schema](https://render.com/docs/blueprint-spec), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
