# PROJECT STATUS

_Generated: 2026-08-16 — based on actual code in repository. Nothing has been invented or inferred beyond what exists in the files._

---

## 1. Overview

**AOM Matching Platform** is a web application for matching property buyers with real estate units using a patent-based optimization algorithm called "Zij" (described in `architecture.md`). The platform also includes a developer (property-developer company) portal for listing units and managing incoming offers.

**Who it is for:**
- **Buyers** — individuals looking to purchase a property who go through an AI-avatar interview to capture their preferences, then receive a ranked list of matching units and can submit offers directly.
- **Property Developers** — companies that register, get verified, list their projects and unit types (AOMs), and manage incoming offers and group-discount negotiations.
- **Platform Administrator** — approves or rejects developer registrations (currently a single unguarded admin page).

**Problem it solves:**
Traditional property matching relies on agents manually comparing buyer requirements against available stock. This platform automates preference elicitation (via a conversational AI avatar), scores compatibility using the Zij linear optimization formula, and adds a simulated blockchain audit trail for transparency. It also introduces "Leverage Groups" — multi-buyer coalitions for group-discount negotiation.

---

## 2. Technology Stack

### Programming Languages & Frameworks

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, full-stack) | 16.2.11 |
| UI library | React + React DOM | 19.2.4 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |

### Database & ORM

| Component | Technology |
|-----------|-----------|
| Database engine | SQLite (`dev.db` in repo root) |
| ORM | Prisma Client v7.9.0 |
| DB driver | `better-sqlite3` v13.0.1 via Prisma driver adapter |
| Migrations | Prisma Migrate (SQLite migrations under `prisma/migrations/`) |

**Main schema (11 models):**
- `User` — central identity; roles: `buyer`, `seller`, `developer`
- `BuyerProfile` — interview output: ēj (expected score), āj (min acceptance score), free-text preferences
- `DeveloperProfile` — company details, CRN, baseline/quality scores, questionnaire answers, web-research & registry-lookup results, `crnStatus` (pending / approved / rejected)
- `Project` — developer's building or development
- `UnitType` — a matchable property unit (AOM) inside a project; fields include `eil`, `ail`, `price`, `quantityAvailable`, `isActive`
- `MatchResult` — buyer-to-AOM match record: pfij, Zij score, validity flag
- `Transcript` — raw interview transcript (JSON array of dialogue lines)
- `Offer` — buyer offer on a unit type; statuses: pending / countered / accepted / rejected
- `LeverageGroup` — multi-buyer group discount negotiation
- `LedgerBlock` — hash-chained blockchain simulation schema (see gap note in §6)
- `LiveAvatarSecret` — singleton ElevenLabs WebRTC room secret

### Third-party Services / APIs / Integrations

| Service | Purpose | Notes |
|---------|---------|-------|
| Anthropic Claude Sonnet 4.6 | Transcript → buyer profile characterization; developer questionnaire baseline scoring; company web-research | `ANTHROPIC_API_KEY` env var required |
| Claude with `web_search` tool | Background company verification during developer registration | `lib/research.ts` |
| Israeli Companies Registry (data.gov.il CKAN API) | CRN verification + company name/status lookup | `lib/registry.ts`; 15 s timeout |
| LiveKit | WebRTC video/audio avatar interview session | `livekit-client` v2.20.2; credentials stub at `/api/liveavatar/session` |
| `bcryptjs` | Password hashing (12 rounds) | |
| `jsonwebtoken` | Stateless JWT auth (7-day expiry) | |
| `pdf-parse` | PDF text extraction (demo only path) | |

### General Architecture

**Monolith** — single Next.js App Router application.

```
app/              # Pages (React Server / Client Components)
app/api/          # API routes (Next.js Route Handlers)
lib/              # Shared pure-logic modules (auth, matching, ledger, scoring, research, registry)
prisma/           # Schema + migrations
scripts/          # Seed scripts (better-sqlite3, run with node)
```

No microservices, no external queues, no caching layer. All computation is synchronous within the same process (background AI verification fires without `await` but still runs in-process).

---

## 3. Existing Features

| # | Feature | Description | Status | Main file(s) |
|---|---------|-------------|--------|-------------|
| 1 | Buyer registration | Email + password → `User(role=buyer)` + JWT issued immediately | Ready | `app/(auth)/register/page.tsx`, `app/api/auth/register/route.ts` |
| 2 | Unified login | Single `/login` page for buyers and developers; redirects based on `crnStatus` | Ready | `app/(auth)/login/page.tsx`, `app/api/auth/login/route.ts` |
| 3 | CRT power-off transition | 1.65 s flicker + collapse animation before interview, for UX effect | Ready | `app/transition/page.tsx`, `app/globals.css` |
| 4 | Avatar interview (LiveKit) | WebRTC video/audio conversation; transcript lines buffered client-side; "End conversation" button saves transcript | Ready (demo mode) | `app/interview/page.tsx`, `app/api/transcript/route.ts`, `app/api/liveavatar/session/route.ts` |
| 5 | DEMO auto-navigate | 5-second timer auto-navigates from interview to /processing (replaces real interview end detection) | DEMO ONLY — must remove before production | `app/interview/page.tsx` |
| 6 | Transcript persistence | POST saves transcript JSON; GET fetches latest (dev shortcut) | Ready | `app/api/transcript/route.ts` |
| 7 | Buyer characterization | Sends transcript to Claude → structured `BuyerProfile` (ēj, āj, free-text preferences) | Ready | `app/api/characterize/route.ts`, `app/processing/page.tsx` |
| 8 | PDF demo path | PDF upload → text extraction → Claude characterization (alternative to avatar interview) | DEMO ONLY — labelled for removal | `app/api/demo/parse-pdf/route.ts`, `app/processing/page.tsx` |
| 9 | Zij matching engine | Computes pfij = optimal price, Zij = 2·pfij − eil − ēj for each AOM; sorts by Zij descending; infeasible matches go to bottom | Ready | `lib/matching.ts`, `app/api/match/route.ts` |
| 10 | AOM catalogue | Lists all active `UnitType` records for matching | Ready | `app/api/aom/route.ts` |
| 11 | Match results page | Ranked cards with alignment bars (seller range vs buyer range, feasible overlap shaded); debug JSON panel (DEMO flag) | Ready (minor DEMO flag) | `app/results/page.tsx` |
| 12 | Buyer offer submission | Inline form on results page; POST offer (unitTypeId, price, optional terms); offer saved with `status=pending` | Ready | `app/results/page.tsx`, `app/api/offers/route.ts` |
| 13 | Simulated blockchain ledger | 3 hash-chained chains (buyer, seller, aom_rating); appends 3 blocks per match request; SHA-256 hash linkage; chain verification | **Partially ready** — persists to DB (`LedgerBlock`) but GET `/api/ledger` is the only consumer; see §6 | `lib/ledger.ts`, `app/api/ledger/route.ts`, `app/api/match/route.ts` |
| 14 | Developer registration | Two-step form: company details + questionnaire; Claude scores questionnaire (0–100 baseline); creates `DeveloperProfile(crnStatus=pending)` | Ready | `app/dev/register/page.tsx`, `app/api/dev/register/route.ts` |
| 15 | Background company verification | Web research (Claude + web_search) + Israeli Companies Registry CRN lookup; run non-blocking after registration | Ready | `lib/research.ts`, `lib/registry.ts`, `app/api/dev/register/route.ts` |
| 16 | Developer pending screen | Visual 4-step stepper (registration → registry check → solicitor sign-off → activation); polls `/api/dev/me` | Ready | `app/dev/pending/page.tsx` |
| 17 | Developer rejected screen | Rejection notice with retry link | Ready (skeleton) | `app/dev/rejected/page.tsx` |
| 18 | Admin approvals page | Lists all developer profiles with web-research summary + registry result; Approve / Reject buttons; re-trigger research/registry | Ready — **NO auth guard** (prototype) | `app/dev/admin/approvals/page.tsx`, `app/api/dev/admin/` routes |
| 19 | Developer dashboard | Three-tab portal: My Projects, Incoming Offers, Leverage Groups | Ready | `app/dev/dashboard/page.tsx` |
| 20 | Project + unit-type CRUD | Create project; add/edit/deactivate unit types with eil, ail, price, quantity, attributes | Ready | `app/api/dev/projects/route.ts`, `app/api/dev/projects/[id]/unit-types/route.ts`, `app/api/dev/unit-types/[id]/route.ts` |
| 21 | Developer offer management | List incoming offers; Accept / Reject / Counter individual offers; quality score refreshed after each action | Ready | `app/api/dev/offers/route.ts`, `app/api/dev/offers/[id]/respond/route.ts` |
| 22 | Leverage group management | List leverage groups; Accept / Reject / Counter; member count displayed | Ready | `app/api/dev/leverage-groups/route.ts`, `app/api/dev/leverage-groups/[id]/respond/route.ts` |
| 23 | Developer quality score | Real-time: `qualityScore = round(0.5 × baselineScore + 0.5 × behaviorScore)`; behavior = responsiveness (40%) + resolution rate (35%) + engagement rate (25%) | Ready | `lib/scoring.ts` |
| 24 | AOM seed utility | Browser UI for seeding AOMs (dev utility page) | Ready (dev utility) | `app/aom-seed/page.tsx` |
| 25 | Unit test suite | Jest tests for matching algorithm and ledger chain | Ready | `lib/__tests__/matching.test.ts`, `lib/__tests__/ledger.test.ts` |

---

## 4. Pages / Screens

| Route | Screen Name | Role | Features from §3 |
|-------|------------|------|-----------------|
| `/` | Homepage | Entry point — "Get started" (→ /register) and "Sign in" (→ /login) links | — |
| `/register` | Buyer Registration | Buyer sign-up | #1 |
| `/login` | Unified Login | Buyers + developers; redirects based on status | #2 |
| `/transition` | CRT Transition | Power-off animation before interview | #3 |
| `/interview` | Avatar Interview | AI video conversation; captures transcript | #4, #5, #6 |
| `/processing` | Processing | Triggers characterization → matching; PDF demo upload | #7, #8, #9, #10 |
| `/results` | Match Results | Ranked AOM cards; alignment bars; offer form | #11, #12 |
| `/dev/register` | Developer Registration | Two-step company + questionnaire form | #14 |
| `/dev/login` | Developer Login | Thin redirect to `/login` | #2 |
| `/dev/pending` | Verification Pending | Stepper; polls approval status | #16 |
| `/dev/rejected` | Registration Rejected | Rejection notice | #17 |
| `/dev/dashboard` | Developer Dashboard | Three-tab portal (projects, offers, groups) | #19, #20, #21, #22, #23 |
| `/dev/admin/approvals` | Admin Approvals | Review and approve/reject developer profiles | #18 |
| `/aom-seed` | AOM Seed Utility | Dev-only: seed AOM data via browser form | #24 |

---

## 5. Core Modules / Components

| Module | Location | Description | Status |
|--------|----------|-------------|--------|
| **Zij Matching Engine** | `lib/matching.ts` | Computes optimal match price pfij and quality score Zij for each buyer–AOM pair; handles feasibility constraints; sorts ranked list | Ready |
| **Blockchain Ledger** | `lib/ledger.ts` | Hash-chained audit trail; 3 independent chains; SHA-256 block hashing; DB-backed via `LedgerBlock` model; chain integrity verification | Ready (DB-backed) |
| **Auth Helpers** | `lib/auth.ts` | bcryptjs password hash/verify; JWT sign/verify; safe token extraction from Authorization header | Ready |
| **Developer Scoring** | `lib/scoring.ts` | `computeBehaviorScore` + `refreshDeveloperQualityScore`; weighted formula over responsiveness, resolution rate, engagement rate | Ready |
| **Web Research** | `lib/research.ts` | Claude Sonnet + `web_search` tool call → structured company verification JSON; stores result on `DeveloperProfile` | Ready |
| **Registry Lookup** | `lib/registry.ts` | data.gov.il CKAN API query by CRN; name normalization + mismatch detection; active-status check | Ready |
| **Prisma Singleton** | `lib/prisma.ts` | Single `PrismaClient` instance with BetterSqlite3 driver adapter; path `./dev.db` | Ready |
| **Design System** | `app/globals.css` | CSS custom properties: paper/ink/teal/gold color tokens; typography (Fraunces / Inter / JetBrains Mono); power-off keyframe animation | Ready |
| **Seed Scripts** | `scripts/` | `seed.mjs` (buyers + demo AOMs), `seed-developer.mjs` (developer accounts), `seed-transcript.mjs` (interview transcript) | Ready (dev only) |

---

## 6. What's Missing / Unfinished

### Critical gaps

| Gap | Detail |
|-----|--------|
| **Admin page has no authentication** | `/dev/admin/approvals` and all `/api/dev/admin/*` routes have zero auth guards. Explicitly noted as "prototype" in `architecture-overview.md` — must be secured before any deployment. |
| **No buyer-facing Leverage Group UI** | `LeverageGroup` model and developer-side response routes exist; quality score accounts for groups. But there is no page/form for buyers to create a group, invite others, or join an existing group. |
| **`seller` role is a stub** | `User.role = "seller"` exists in the schema but there are no pages, API routes, or business logic for a pure seller (non-developer) persona. |
| **`quantityAvailable` not decremented** | `UnitType.quantityAvailable` field exists but no code reduces it when an offer is accepted. Accepting an offer only sets `Offer.status = "accepted"`. |
| **Transaction closing is absent** | After an offer is accepted there is no contract generation, payment integration, escrow, legal handoff, or any downstream step. |
| **No notifications** | No email, SMS, or push notifications when offer status changes for either buyers or developers. |
| **No KYC / identity verification** | Phone number is stored as a plain string; no document upload, no government-ID linkage for buyers or developers (beyond CRN registry lookup). |
| **CRN ownership not cryptographically proven** | Registry lookup checks name and active status but does not prove the registrant actually controls the company. No document upload path exists. |

### Demo flags that must be removed before production

| File | Flag | Action required |
|------|------|-----------------|
| `app/interview/page.tsx` | 5-second countdown auto-navigates to `/processing` | Remove timer; implement real conversation-end detection |
| `app/processing/page.tsx` | PDF upload path + "Use demo transcript" button | Remove entire PDF branch |
| `app/results/page.tsx` | `DEMO_SHOW_PROFILE = true` exposes raw `BuyerProfile` JSON | Set to `false` |

### Minor gaps

- `JWT_SECRET` defaults to `"dev-secret-change-me"` if env var is absent — must be set in production.
- `/api/liveavatar/session` returns a placeholder credential; real LiveKit room provisioning is not implemented.
- `app/dev/login/page.tsx` is a thin redirect to `/login` — effectively a dead route, can be cleaned up.
- No rate limiting, CSRF protection, or request validation beyond basic type checks.

---

## 7. Open Questions / Ambiguities

1. **Ledger persistence — is the DB-backed implementation intentional or in-progress?**
   `lib/ledger.ts` writes to the `LedgerBlock` database table (SQLite). However, `architecture-overview.md` describes the ledger as "in-memory simulation" and says the table is "NEVER WRITTEN TO." The current code *does* write to it (via `appendBlock`). It is unclear whether the DB-backed version is considered complete or whether a real distributed blockchain integration is still expected.

2. **Who is the "seller" persona and when is it planned?**
   `User.role = "seller"` exists but nothing else does. Is this a future persona distinct from a developer, or was it an early design artifact that is no longer needed?

3. **LeverageGroup creation — who creates them and when?**
   The model has `developerId` and `unitTypeId` but no `buyerId` collection field. It is unclear from the code how buyers are associated with a group, or whether groups are created by developers or by buyers.

4. **LiveKit / avatar provider — what is the intended production setup?**
   The session route returns placeholder credentials. Is ElevenLabs the intended avatar provider (referenced in the `LiveAvatarSecret` model), or LiveKit's own avatar SDK, or a third service?

5. **`architecture.md` vs `architecture-overview.md` vs `developer_side_prompt.md` — which is authoritative?**
   There are three overlapping design documents. `architecture-overview.md` has a date of 2026-07-27 and describes current state; `developer_side_prompt.md` reads like a Phase 2 prompt spec; `architecture.md` reads like the original patent/Phase 1 spec. Their relative authority and whether they are kept up-to-date is unclear.

6. **Israeli Companies Registry endpoint stability**
   `lib/registry.ts` hard-codes a specific CKAN resource ID (`f004176c-b85f-4542-8901-7b3176f9a054`). If this resource is updated or replaced by the government, the lookup will silently fail. Is there a plan for monitoring or fallback?

7. **`web_search` tool name**
   `lib/research.ts` uses `web_search_20260209` as the tool name. This appears to be a dated snapshot of the web_search tool. If the Anthropic API changes this tool identifier, research will fail silently (errors are caught). Is this the expected long-term tool name?

8. **No test coverage for API routes or React components**
   Unit tests exist only for `lib/matching.ts` and `lib/ledger.ts`. There are no integration tests, API route tests, or UI tests. Is this intentional for v0.1?

9. **`prisma.config.ts` at root vs `prisma/` folder**
   `prisma.config.ts` lives in the repo root; `schema.prisma` and migrations live in `prisma/`. This is non-standard Prisma layout. Is this intentional (e.g. required by Prisma v7 CLI config)?

10. **Database for production**
    The current DB is SQLite with a committed `dev.db` file. What is the intended production database? PostgreSQL/MySQL would require schema and driver changes.
