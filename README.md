# PetMood

React web app (Vite + Tailwind) served by a small Express server on **Google Cloud Run**, with all data and
business rules in **AWS** (`sa-east-1`, account 786788037131).

```
Browser ──▶ Cloud Run (server.ts) ── /api/* ──▶ API Gateway HTTP API ($default route)
            adds x-api-key                       ▼
                                   ONE Lambda: cc-petmood-api (Python 3.13, internal router)
                                                 ▼
             DynamoDB: cc-petmood-users, -identities, -animals, -vaccines, -events, -tips, -ads  +  S3 (photos)
```

- The browser only calls its own `/api/*`. The AWS URL and the shared key stay on the server.
- The Lambda checks the key (constant time) on every request, then the session token on protected routes.
- Sign-in: e-mail + password (scrypt hashes) **or** Google (OAuth code popup; the Lambda exchanges the code
  and verifies the identity). A Google login with the same verified e-mail as an existing account is linked to it.
- Photos are stored in S3 (`cc-petmood-files-786788037131`, key `img/<id>`) and served at `/api/files/<id>`.
  `FILE_STORE=dynamodb` switches to the `cc-petmood-files` table as a fallback.

## Layout

| Path | What |
|---|---|
| `src/` | Frontend (screens unchanged; `services/api.ts` calls `/api/*`, `services/googleAuth.ts` handles Google) |
| `server.ts` | Cloud Run server: static app + `/api` proxy + `/api/config` (Google client id) |
| `aws/lambda/handler.py` | The whole backend (routes, validation, auth) |
| `aws/deploy.sh` | Idempotent deploy: tables, IAM role (with boundary), Lambda, HTTP API, seed data |
| `aws/tests/test_handler.py` | Unit tests with in-memory fakes (`npm run test:api`) |
| `aws/scripts/smoke.py` | End-to-end checks against the deployed API |
| `aws/seed/` | Tips and ads seed data; `original-mock/` keeps the old front-end mock for reference |

## Run locally

1. Create `.env.local` from `.env.example`. The URL is in `aws/.api-url`; the key is `API_KEY` in `aws/.env.deploy`.
2. `npm install`, then `npm run dev` and open http://localhost:3000.
3. For Google sign-in on localhost, add `http://localhost:3000` to the OAuth client's *Authorized JavaScript origins*.

## Deploy the backend

```sh
AWS_PROFILE=App-dev-786788037131 bash aws/deploy.sh   # safe to re-run
python -I aws/scripts/smoke.py                         # go-live checks
```

`aws/.env.deploy` (git-ignored, created on first run) holds `API_KEY`, `JWT_SECRET`, `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`. The script merges Lambda variables; it never deletes existing ones.

## Google sign-in setup (once)

1. Google Cloud Console → *APIs & Services* → *OAuth consent screen*: configure it (External, scopes `openid`, `email`, `profile`).
2. *Credentials* → *Create credentials* → *OAuth client ID* → **Web application**.
   - Authorized JavaScript origins: the Cloud Run URL (e.g. `https://petmood-xxxx.run.app`), plus `http://localhost:3000` for dev.
   - No redirect URI is needed (popup flow).
3. Put the client id and secret in `aws/.env.deploy` and re-run `aws/deploy.sh`.
4. Set `GOOGLE_CLIENT_ID` on Cloud Run (see below).

## Android app (APK)

The same React app is wrapped with **Capacitor** (`android/`, `capacitor.config.ts`, app id `com.animood.app`).
The UI is bundled in the APK; data goes to the Cloud Run server (`src/services/platform.ts`, CORS for `https://localhost`
in `server.ts`).

The native parts:
- **Google sign-in:** the Android account picker (`@capgo/capacitor-social-login`, offline mode → server auth code,
  `platform: 'android'`).
- **Notifications:** reminders and alarms scheduled with the OS (`src/services/nativeNotifications.ts`), so they fire
  with the app closed.
- **PDF:** export opens the Android share sheet.

Build: `npm run android:apk` → `release/AniMood.apk`. This needs JDK 21 and the Android SDK in `C:\Android`, plus
`android/keystore.properties` (git-ignored) pointing at the release keystore.

Google setup for the APK: in the same Google Cloud project, create an OAuth client of type **Android** with package
`com.animood.app` and the release keystore's SHA-1.

## Cloud Run variables

| Variable | Value |
|---|---|
| `PETMOOD_API_URL` | contents of `aws/.api-url` |
| `PETMOOD_API_KEY` | `API_KEY` from `aws/.env.deploy` — as a **Secret Manager reference** |
| `GOOGLE_CLIENT_ID` | the OAuth Web client id |

Build: `npm run build` · Start: `npm start` (Cloud Run provides `PORT`).
