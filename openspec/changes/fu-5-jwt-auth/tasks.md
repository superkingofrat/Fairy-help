## 1. Database

- [ ] 1.1 Add `passwordHash String` to `User` in `schema.prisma`; migration `add_user_password_hash`
- [ ] 1.2 Seed: bcrypt-hash fixed dev passwords for both seed users (demo-only comments)

## 2. Shared contracts

- [ ] 2.1 `schemas/authSchemas.ts`: `loginSchema` (email+password), `authUserSchema` (id/email/role); export

## 3. API

- [ ] 3.1 Add `jsonwebtoken` + `bcryptjs` deps; `index.ts` startup validation for required `JWT_SECRET`; `.env.example` marks it required
- [ ] 3.2 `POST /api/auth/login` + `GET /api/auth/me` (controller + public routes on `createApp`); unified 401 on bad credentials; HS256 12h token
- [ ] 3.3 Rewrite `authMiddleware` to Bearer-only (verify + inject userId/role; 401 otherwise; `X-Dev-Role`/`Bearer dev-*` removed); `requireRole` unchanged

## 4. Tests

- [ ] 4.1 `tests/helpers/auth.ts` with `authHeader(role)`; migrate all stub headers across api test files; set fixed test `JWT_SECRET`
- [ ] 4.2 Auth route tests: login success/wrong-password 401 identical body/me; stub headers rejected (401); role boundary 403/200 under JWT
- [ ] 4.3 Regression: existing suites green under real auth

## 5. Web

- [ ] 5.1 `stores/authStore.ts` (zustand persist: token/user, login/logout/clear) + `lib/authApi.ts` (login/me); 4 API clients inject `Authorization` from store and handle 401 (clear + redirect `/login`)
- [ ] 5.2 `/login` page (email/password, inline errors, i18n) + route guards (`/chat` session, `/admin/*` admin) + role-scoped nav with logout; chat speaker = logged-in user
- [ ] 5.3 Web tests: login page, guard redirects, role nav (mock authApi)

## 6. Docs and verification

- [ ] 6.1 `API_CONTRACT.md` (auth endpoints, Bearer-only, drop per-endpoint dev-auth sections); `ARCHITECTURE.md` auth layer; `.env.example`
- [ ] 6.2 Run shared/api/web tests + typecheck for touched packages
