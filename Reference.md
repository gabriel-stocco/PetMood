# PetMood — Reference / working cache

Last updated: 2026-11-25. Read this first when resuming work on this project.
No secrets in this file: keys live in `aws/.env.deploy` and `.env.local` (both git-ignored).

---

## 1. Goal (from the user)

- Keep the app's design almost identical to the original AI Studio mock.
- Move all data and business logic out of the frontend into **AWS**: DynamoDB tables, one API Gateway route, and
  **one Lambda** with an internal router.
- Follow `NEW-PROJECT-PLAYBOOK.md` but **ignore the corporate parts** (IAP, Microsoft login, Power Automate).
  The app is not a company app.
- Add **Google login**, while keeping e-mail/password sign-up. Both options appear in the UI.
- Frontend runs on **Google Cloud Run** (AI Studio). At the end, tell the user the Cloud Run variables.
- User chose to deploy into AWS account **786788037131** (profile `App-dev-786788037131`, sa-east-1), with the
  `cc-` prefix and the `cc-lambda-boundary` permissions boundary.

## 2. Status

| Area | State |
|---|---|
| AWS backend | Deployed and working. 22 unit tests pass; 16/16 end-to-end checks pass (`aws/scripts/smoke.py`) |
| Frontend → real API | Done. Mock removed from the bundle; production build tested locally through the proxy |
| E-mail/password sign-up and login | Working end to end |
| Google login | Code done; **not configured** (no OAuth client yet). Button shows "Login com Google não está configurado." |
| Cloud Run deploy | Not done by Claude. User deploys via AI Studio and sets the variables (§7) |
| Photos | S3 bucket `cc-petmood-files-786788037131`, key `img/<name>` (§6) |
| Visual check in a real browser | Not done by Claude. User is testing at http://localhost:3000 |

## 3. Architecture

```
Browser ──▶ Cloud Run: server.ts ── /api/<route> (POST) ──▶ API Gateway HTTP API e8rzy2qg6i ($default route)
            adds x-api-key                                    ▼
            /api/files/<name> (GET) ─────────────▶ Lambda cc-petmood-api (Python 3.13, handler.handler)
            /api/config (Google client id)                    ▼
                                         DynamoDB cc-petmood-* (users, identities, animals, vaccines,
                                         events, tips, ads, files)
```

- The browser never calls AWS and never sees the AWS URL or the key.
- **Lambda checks on every request:**
  1. `/health` is public.
  2. If `API_KEY`/`JWT_SECRET` (or `BUCKET` when `FILE_STORE=s3`) is missing → 503.
  3. Constant-time `x-api-key` check → 401 on failure.
  4. Protected routes: verify the session token, then load the user (401 if missing).
- **Identity comes only from the token.** The `id_usuario` the frontend sends in bodies is ignored.
- **Sessions:** HS256 tokens signed by the Lambda (`JWT_SECRET`), valid 7 days, `iss=petmood`. The frontend keeps
  them in localStorage, as the mock did.
- **Passwords:** scrypt (n=2^14, r=8, p=1), Python stdlib only.
- **Google login:** Google Identity Services *authorization-code popup* (`initCodeClient`, `redirect_uri=postmessage`).
  - The browser gets a one-time code. `/googleLogin` exchanges it at `oauth2.googleapis.com/token` with the client
    secret, then checks `iss`, `aud`, `exp`/`iat` and `email_verified`.
  - No `cryptography` dependency: OIDC allows relying on TLS when the token comes straight from the token endpoint.
  - Lookup order: Google identity → existing account with the same verified e-mail (linked) → new account
    without a password.
- The Lambda has no third-party dependencies (boto3 comes with the runtime).

## 4. AWS resources (account 786788037131, sa-east-1)

| Resource | Name / detail |
|---|---|
| Lambda | `cc-petmood-api`: python3.13, x86_64, 512 MB, 30 s |
| IAM role | `cc-petmood-lambda-role` + boundary `cc-lambda-boundary`; inline policy `cc-petmood-access` (logs, DynamoDB `cc-petmood-*`, S3 on the bucket) |
| HTTP API | `cc-petmood-http-api`, id `e8rzy2qg6i`, one `$default` route, AWS_PROXY payload 2.0, stage `$default` auto-deploy, throttling 50 burst / 25 rate |
| API URL | `https://e8rzy2qg6i.execute-api.sa-east-1.amazonaws.com` (also in `aws/.api-url`) |
| S3 bucket | `cc-petmood-files-786788037131`: private, encrypted, TLS-only policy. Photos at `img/<name>` (`FILE_STORE=s3`, §6) |

All tables are PAY_PER_REQUEST, with deletion protection and point-in-time recovery:

| Table | Key | Notes |
|---|---|---|
| `cc-petmood-users` | `id_usuario` | `nome, email, senha_hash?` (absent for Google-only), `google_sub?`, `celular, data_nascimento, genero, foto, notificacao_app, notificacao_whatsapp, criado_em, atualizado_em` |
| `cc-petmood-identities` | `ident` | `email#<email>` or `google#<sub>` → `id_usuario`. Conditional puts keep e-mails and Google accounts unique |
| `cc-petmood-animals` | `id_usuario` + `id_animal` | |
| `cc-petmood-vaccines` | `id_usuario` + `id_vacina` | has `id_animal` |
| `cc-petmood-events` | `id_usuario` + `id_evento` | `animal` = list of `{tabela, id_animal, nome}` |
| `cc-petmood-tips` | `id_dicas` | seeded (5), has `ordem` |
| `cc-petmood-ads` | `id_propaganda` | seeded (5), has `ordem` |
| `cc-petmood-files` | `name` | photo bytes (`data` Binary); fallback only, used when `FILE_STORE=dynamodb` (currently unused) |

**Lambda variables:**

| Variable | Notes |
|---|---|
| `API_KEY` | |
| `JWT_SECRET` | |
| `TABLE_PREFIX` | `cc-petmood-` |
| `BUCKET` | |
| `FILE_STORE` | `s3` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | set only once the user provides them |

`deploy.sh` merges these with the existing variables; it never removes any.

## 5. API routes (all `POST` with a JSON body, except where noted)

| Route | Notes |
|---|---|
| `GET /health` | public, 200 `{status:"ok"}` |
| `/login`, `/createAccount`, `/googleLogin` | public (still need the API key); return `{status, id_usuario, accessToken}`. `/googleLogin` takes `{code}` |
| `/getAll` | same shape as the mock: `[usuario, {animais (with vacinas)}, {evento}, {dicas without artigo}, {propaganda ≤5}]` |
| `/getTip`, `/getAccount` | |
| `/updateAccount`, `/deleteAccount` | an e-mail change claims the new identity (409 if taken); delete cascades to all items, photos and identities |
| `/createAnimal`, `/updateAnimal`, `/deleteAnimal` | renaming syncs the animal's name on events; delete cascades to vaccines and photos |
| `/createEvent`, `/updateEvent`, `/deleteEvent` | animal refs are filtered to the user's own animals; names come from the DB |
| `/createVaccine`, `/updateVaccine`, `/deleteVaccine` | `id_animal` must belong to the user |
| `/dispatchEventNotifications` | same logic as the mock; WhatsApp is still `disparado_mock` (not integrated) |
| `GET /files/<32hex>.<jpg\|png\|webp\|gif>` | returns photo bytes. Unguessable names act as the access control, because `<img>` tags can't send auth headers |

**Validation ported from the mock:**
- e-mail format, password of 8+ characters, Brazilian cellphone rule, WhatsApp requires a valid phone;
- no future birth dates (judged in UTC−3);
- photos ≤ 300k characters (413 if larger), alarms need a time, events need a type;
- 403 on another user's records.

**Additions beyond the mock:** text length caps (5000 characters), image type check by file signature, and photo
values restricted to a data URL, http(s), or the item's current `/api/files/` value.

**User object extra flags:** `login_google`, `possui_senha`. Secrets are never returned.

## 6. S3 and `cc-lambda-boundary` (resolved 2026-11-25)

- At first the Lambda got: *"not authorized to perform: s3:PutObject ... because no permissions boundary allows the
  s3:PutObject action"*. The boundary only allowed S3 on `cc-it-dashboard-attachments-786788037131/*`.
- On 2026-11-25 the boundary statement was widened (by the user/admin) to cover every `cc-` bucket, e.g.
  `arn:aws:s3:::cc-*-786788037131/*` for Get/Put/DeleteObject. The user's SSO role can't read the boundary
  (`iam:GetPolicy` denied), so it was verified by testing.
- Switched to `FILE_STORE=s3`; `deploy.sh` now defaults to `s3`. The smoke test passed 16/16: the photo upload and
  serve worked, the bucket was empty again after `deleteAccount` (so DeleteObject works), and the logs show no AccessDenied.
- Migration: the `cc-petmood-files` table was empty, so there was nothing to copy. The table is kept as a fallback
  (`FILE_STORE=dynamodb bash aws/deploy.sh`).

## 7. Cloud Run variables (tell the user / set in AI Studio)

| Variable | Value |
|---|---|
| `PETMOOD_API_URL` | `https://e8rzy2qg6i.execute-api.sa-east-1.amazonaws.com` |
| `PETMOOD_API_KEY` | `API_KEY` from `aws/.env.deploy`, as a **Secret Manager reference**. Never print it |
| `GOOGLE_CLIENT_ID` | OAuth Web client id (not created yet) |

Cloud Run provides `PORT`. Build: `npm run build`; start: `npm start` (`node server.js`).

## 8. Files created / changed

**New:**

| File | Purpose |
|---|---|
| `aws/lambda/handler.py` | the whole backend |
| `aws/tests/test_handler.py` | 22 tests; stubs boto3/botocore, in-memory tables. Run with `npm run test:api` |
| `aws/deploy.sh` | idempotent deploy: account check, secrets init, tables, seed, bucket, role+boundary, Lambda (zip via Python), env merge, HTTP API |
| `aws/scripts/helpers.py` | zip, `.env.deploy` init, env merge, policies, seed requests (ASCII JSON for Windows) |
| `aws/scripts/smoke.py` | end-to-end checks against the real API. Uses a `*.teste@example.com` account and deletes it afterwards |
| `aws/seed/seed_data.json` | tips and ads |
| `aws/seed/original-mock/` | the old `mockBackend.ts` and `mock_database.json`, moved out of `src/` for reference |
| `server.ts` | Express: `/api/config`, `/api/files/:name`, `POST /api/:route` proxy; Vite middleware in dev, `dist/` in prod (prod = running `server.js` or `NODE_ENV=production`); loads `.env.local` |
| `src/services/googleAuth.ts` | GIS code client; `prepareGoogleSignIn()` on mount so the popup opens inside the click |
| `README.md` | architecture, run, deploy, Google setup |
| `Reference.md` | this file |

**Changed:**
- `src/services/api.ts`: `fetch('/api/<route>')` instead of the mock; 401 on protected routes clears the session.
- `src/types/index.ts`: `GoogleLoginPayload` is now `{code}`; `Usuario` has `login_google?` and `possui_senha?`.
- `src/context/AppContext.tsx`: `signInWithGoogle(code)`.
- `src/screens/LoginScreen.tsx`:
  - the real Google popup;
  - removed the "Conta de teste (Mock)" box and its test credentials;
  - new "Esqueci minha senha" text.
- `src/screens/RegisterScreen.tsx`: added an "ou" divider and a **"Cadastrar com o Google"** button (teal style).
- `package.json`:
  - scripts: `dev` = `tsx server.ts`; `build` = vite + esbuild bundle to `server.js`; `start` = `node server.js`;
    `test:api`;
  - `esbuild` bumped to `^0.28.0` (npm peer conflict with Vite 8). `bun.lock` is now stale; a `package-lock.json`
    was created.
- `tsconfig.json`: excludes `aws` and `server.js`.
- `.gitignore`: adds `server.js`, `aws/.env.deploy`, `aws/.api-url`, `__pycache__/`.
- `.env.example`: the three Cloud Run variables.

**Not touched:** `expo-app/` (it still has its own mock backend).

## 11. Android APK (Capacitor), added 2026-11-26

- **Approach:** Capacitor 8; the UI is bundled in the APK (`webDir: dist`), and the app's origin is `https://localhost`.
  - API calls and photo URLs go to Cloud Run `https://petmood-200705042850.us-east1.run.app`
    (`src/services/platform.ts`; `rewriteFileUrls` makes `/api/files/...` absolute when data comes in and relative
    when it goes out).
  - `server.ts` allows CORS for `https://localhost` only. **Cloud Run must be redeployed** for the APK to reach the API.
- **Toolchain** (outside the repo):
  - `C:\Android\jdk-21`, `C:\Android\sdk` (platforms 35+36, build-tools 35+36, platform-tools).
  - Build with `npm run android:apk` (`scripts/build-apk.sh`) → `release/AniMood.apk`.
- **Keystore:** `C:\Android\keys\animood-release.jks`, alias `animood`.
  - The password is in `android/keystore.properties` (git-ignored).
  - **Back up both files.** Losing them means installed apps can't be updated.
  - SHA-1 `5B:0C:06:35:BC:4C:79:40:C6:1B:B7:2B:AD:9D:1B:42:DA:67:27:DB`.
- **Google on Android:**
  - `@capgo/capacitor-social-login` in `mode: 'offline'`, with `webClientId` from `/api/config`.
  - `MainActivity` implements `ModifiedMainActivityForSocialLoginPlugin` (required for offline mode).
  - The frontend sends `{code, platform:'android'}`; the Lambda exchanges it with `redirect_uri=''` (the web uses `'postmessage'`).
  - **User step:** create an OAuth client of type **Android** (package `com.animood.app` + the SHA-1 above) in the
    same Google Cloud project.
- **Notifications:**
  - `src/services/nativeNotifications.ts` rebuilds the OS schedule (2d/1d/1h/0m for each event, at most 60) whenever
    the data changes, the app resumes, or permission is granted.
  - `showBrowserNotification` is a no-op on native, except for snoozes (`notScheduled`).
  - Channels: `petmood-lembretes` and `petmood-alarmes`.
  - Tapping a notification opens the Events tab.
- **Other native bits:**
  - The Android back button goes to Home, then minimizes the app.
  - PDF export goes through Filesystem (cache) and the Share sheet.
  - Camera permission is in the manifest.
- **Icons/splash:** generated from the login screen's paw logo (`assets/*.png`, `npx capacitor-assets generate --android`).

## 9. To do / open items

1. **Google login setup (user):**
   1. Create an OAuth consent screen and an OAuth client of type **Web application**.
   2. Authorized JavaScript origins: the Cloud Run URL and `http://localhost:3000`. No redirect URI.
   3. ~~Put the id and secret in `aws/.env.deploy` and deploy~~ done 2026-11-25 (Lambda has both; also set on Cloud Run).
   4. Set `GOOGLE_CLIENT_ID` in `.env.local` and on Cloud Run.
   5. Test with a real Google account (never tested yet).
2. ~~S3 boundary fix~~ done 2026-11-25 (§6).
3. **Cloud Run / AI Studio deploy** with the variables in §7, then a first real sign-in on the deployed URL.
4. **APK:** redeploy Cloud Run (CORS), create the Android OAuth client, then test on a phone
   (Google, notifications with the app closed, camera, PDF).
5. **Optional improvements discussed (not done):**
   - Per-account login throttling; today only the API Gateway's overall limit applies.
   - Password reset flow (none exists; "Esqueci minha senha" only shows text).
   - Account linking by verified Google e-mail: sign-up doesn't verify e-mails, so an attacker could pre-register a
     victim's address and keep the password after the victim links Google. Consider e-mail verification, or
     clearing the password on link.
   - Real WhatsApp delivery.
   - Update `expo-app` to use the same API.
   - Regenerate `bun.lock` if AI Studio uses bun.

## 10. Environment notes / gotchas (this machine)

- **Node isn't installed.** A portable Node 22.21.1 (SHA-verified) is in this session's scratchpad, which may be
  wiped. Use it with:
  `export PATH="/c/Users/Joe_R/AppData/Local/Temp/claude/d2a95122278071c4/b0961b57-204d-442f-8421-02c0f17177a6/scratchpad/node/node-v22.21.1-win-x64:$PATH"`.
  If it's gone, re-download it as in playbook §4.1.
- **Python** 3.14 is installed. boto3 is not installed locally; tests use stubs.
- **AWS:** always use `AWS_PROFILE=App-dev-786788037131`; the `default` profile has no credentials. Use
  `MSYS_NO_PATHCONV=1` for `aws logs` commands in Git Bash, otherwise `/aws/lambda/...` gets rewritten to a
  Windows path. Your role can't use `iam:SimulatePrincipalPolicy` or `iam:GetPolicy`.
- **Dev server:** `npm run dev` on :3000. Port 3000 clashed with the **lei-do-bem** dev server (which listens on IPv6
  `::`, so `localhost` went there). The user approved stopping it on 2026-11-25. Check
  `Get-NetTCPConnection -LocalPort 3000,24678` before starting. Stopping the background task can leave the tsx child
  process alive; kill its PID too.
- **Never print** `API_KEY`, `JWT_SECRET` or the Google secret in tool output.
