# MINDQUEST AI — Architecture, API Reference, Windows Setup & Deployment Guide

## 1. System Overview

**MINDQUEST AI** is a commercial-grade international AI English learning SaaS uniting three adaptive engines around one learner profile:
1. **Mood Mode**: Optional mood selection (`Happy`, `Sad`, `Tired`, `Motivated`, `Relaxed`, `Curious`, `Confident`, `Stressed`), CEFR vocabulary with Uzbek & Russian glossaries, IPA phonetics, neural WAV audio, flashcards, and comprehension stories.
2. **Simulator Mode**: 9 real-life English RPG scenarios (`Airport`, `Hotel`, `Restaurant`, `Job Interview`, `University`, `Shopping`, `Travel`, `Business`, `Everyday`) with speech-to-text, neural TTS, turn-by-turn grammar assessment, and Mood vocabulary reuse bonuses.
3. **Detective Mode**: Fictional mystery cases across 9 grammar domains (`tenses`, `conditionals`, `passive_voice`, `articles`, `prepositions`, `pronouns`, `reported_speech`, `modal_verbs`, `sentence_structure`) with server-validated culprit answers and **Unified Intelligence** conversion of Simulator mistakes into custom cases.
4. **Bilingual AI Teacher & Super Admin Console**: English + Uzbek coaching, personalized 7-day study plans, full RBAC admin analytics, plan/quota editor, promo codes, refunds, AI spend circuit breaker, and CSV exports.

---

## 2. Database Schema, Migrations & Backup Strategy

- **Production PostgreSQL DDL**: `/database/migrations/001_initial_schema.sql` defines all 24 normalized tables, UUID primary keys, check constraints, and composite indexes.
- **Apply Migration on PostgreSQL**:
  ```bash
  psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql
  ```
- **Local Zero-Config Persistence**: When `DATABASE_URL` is empty, `/server/db.ts` automatically runs WAL-mode ACID SQLite at `./data/mindquest.sqlite`.
- **Automated Backup Strategy**:
  - **PostgreSQL**: Daily `pg_dump --format=custom "$DATABASE_URL" > backups/mindquest_$(date +%F).dump` + Cloud SQL / RDS point-in-time recovery (PITR) with 14-day retention.
  - **SQLite Local**: Online hot backup via `sqlite3 data/mindquest.sqlite ".backup 'backups/mindquest.sqlite.bak'"`.

---

## 3. Windows Local Installation & Commands (PowerShell)

1. Install **Node.js 22 LTS** (includes npm and native build tools) and **PostgreSQL 16+** (optional for local dev).
2. Open **PowerShell** in the project directory:
   ```powershell
   Copy-Item .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   npm install
   ```
3. Run automated integration tests:
   ```powershell
   npm test
   ```
4. Start the full-stack development server on `http://localhost:3000`:
   ```powershell
   npm run dev
   ```
5. Build for production & run:
   ```powershell
   npm run build
   $env:NODE_ENV="production"
   npm start
   ```

---

## 4. Payment Provider Configuration (Stripe, Payme, Click)

Raw card numbers and CVV codes are **never** handled or stored by MINDQUEST AI.

- **Stripe (International USD)**:
  - Set `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...`.
  - Point Stripe webhook endpoint to `https://<your-domain>/api/webhooks/stripe` (`checkout.session.completed`).
- **Payme / Paycom Uzbekistan (UZS JSON-RPC 2.0)**:
  - Set `PAYME_MERCHANT_ID`, `PAYME_SECRET_KEY` (or `PAYME_TEST_SECRET_KEY`), and `PAYME_SANDBOX_MODE=true`.
  - Configure Merchant Cabinet callback URL to `https://<your-domain>/api/webhooks/payme` using Basic Auth (`Paycom:<KEY>`).
- **Click Uzbekistan (UZS SHOP-API)**:
  - Set `CLICK_MERCHANT_ID`, `CLICK_SERVICE_ID`, and `CLICK_SECRET_KEY`.
  - Configure Prepare URL: `https://<your-domain>/api/webhooks/click/prepare`
  - Configure Complete URL: `https://<your-domain>/api/webhooks/click/complete`

---

## 5. Key Structured API Endpoints

- **Auth & Security (`/api/auth/*`)**:
  - `POST /api/auth/register` — Account creation, minor consent check, referral linking
  - `POST /api/auth/verify-email` — Email token verification
  - `POST /api/auth/login` — Password + optional 6-digit 2FA login
  - `POST /api/auth/forgot-password` & `POST /api/auth/reset-password`
  - `GET /api/auth/me`, `PATCH /api/auth/profile`, `POST /api/auth/2fa/toggle`
  - `GET /api/auth/security-activity`, `DELETE /api/auth/sessions/:id`, `DELETE /api/auth/account`
- **Subscriptions & Payments (`/api/billing/*` & `/api/webhooks/*`)**:
  - `GET /api/billing/plans` — Active tiers & gateway states
  - `POST /api/billing/start-trial`, `POST /api/billing/validate-promo`, `POST /api/billing/checkout`
  - `POST /api/billing/downgrade-or-cancel`, `GET /api/billing/history`
  - `POST /api/billing/redeem-gift`, `POST /api/billing/join-team`, `POST /api/billing/create-team`, `POST /api/billing/affiliate-apply`
  - `POST /api/webhooks/stripe`, `POST /api/webhooks/payme`, `POST /api/webhooks/click/:stage`
- **Unified AI Learning (`/api/learning/*`)**:
  - `GET /api/learning/mood/content`, `POST /api/learning/mood/generate-vocab`, `POST /api/learning/mood/review-word`, `POST /api/learning/mood/generate-story`, `POST /api/learning/mood/submit-quiz`
  - `GET /api/learning/simulator/scenarios`, `POST /api/learning/simulator/start`, `POST /api/learning/simulator/turn`
  - `GET /api/learning/detective/cases`, `POST /api/learning/detective/generate`, `POST /api/learning/detective/solve`
  - `POST /api/learning/teacher/ask`, `POST /api/learning/voice/tts`, `POST /api/learning/voice/stt`
  - `GET /api/learning/dashboard-summary`
- **Super Admin Console (`/api/admin/*` — RBAC Protected)**:
  - `GET /api/admin/overview`, `GET /api/admin/users`, `PATCH /api/admin/users/:id`
  - `PUT /api/admin/plans/:id`, `GET /api/admin/billing`, `POST /api/admin/promo-codes`, `POST /api/admin/refund/:paymentId`, `PATCH /api/admin/affiliates/:id`
  - `GET /api/admin/ai-config`, `PUT /api/admin/ai-config`, `GET /api/admin/content`, `POST /api/admin/content/vocabulary`, `GET /api/admin/export/:dataset`
