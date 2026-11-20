# Architecture Overview

> Reflects the **actual current state of the code** as of 2026-07-27.  
> Goal: identify what exists today versus what is still missing.

---

## 1. General Structure

### Folder Tree (2–3 levels deep)

```
RealEstateAgent/
├── app/                        Next.js App Router (pages + API)
│   ├── (auth)/                 Buyer auth pages (login, register)
│   │   ├── login/              /login  → app/(auth)/login/page.tsx
│   │   └── register/           /register → app/(auth)/register/page.tsx
│   ├── api/                    All server-side API route handlers
│   │   ├── auth/               Buyer login/register (JWT-based)
│   │   │   ├── login/route.ts
│   │   │   └── register/route.ts
│   │   ├── aom/route.ts        GET — list all active unit types
│   │   ├── characterize/       POST — extract buyer profile from transcript (Claude)
│   │   ├── demo/parse-pdf/     POST — demo PDF-upload characterization path
│   │   ├── ledger/route.ts     GET — query simulated blockchain chains
│   │   ├── liveavatar/session/ POST — LiveKit session credentials (stub)
│   │   ├── match/route.ts      POST — run Zij matching algorithm
│   │   ├── offers/route.ts     POST — buyer submits offer
│   │   ├── transcript/         POST save / GET latest transcript
│   │   └── dev/                Developer-only routes (guarded by JWT role)
│   │       ├── admin/          Admin workflow (no auth — prototype)
│   │       │   ├── approvals/  GET — list all developer profiles
│   │       │   ├── approve/[id]/  POST — approve or reject
│   │       │   ├── research/[id]/ POST — trigger AI web research
│   │       │   └── registry/[id]/ POST — trigger registry lookup
│   │       ├── aoms/           GET list / GET [id] — developer's unit types
│   │       ├── leverage-groups/ GET list / POST [id]/respond
│   │       ├── me/route.ts     GET — current developer profile
│   │       ├── offers/         GET list / POST [id]/respond
│   │       ├── projects/       GET + POST / POST [id]/unit-types
│   │       ├── register/       POST — developer registration
│   │       └── unit-types/[id]/ PUT + DELETE
│   ├── aom-seed/               Dev utility: seed AOMs via UI
│   ├── dev/                    Developer-facing pages
│   │   ├── admin/approvals/    Hidden admin approvals page
│   │   ├── dashboard/          Main developer dashboard (projects, offers, groups)
│   │   ├── login/              Developer login
│   │   ├── pending/            Waiting-for-approval page
│   │   └── rejected/           Application-rejected page
│   ├── interview/              Avatar interview page (LiveKit)
│   ├── processing/             Characterization + matching orchestration
│   ├── results/                Ranked match results + send-offer UI
│   ├── transition/             Power-off transition page (placeholder)
│   ├── globals.css             Global styles
│   ├── layout.tsx              Root layout (font loading, metadata)
│   └── page.tsx                Homepage (entry point)
├── lib/                        Shared server-side modules
│   ├── auth.ts                 JWT + bcrypt helpers
│   ├── ledger.ts               In-memory 3-chain hash-linked ledger
│   ├── matching.ts             Zij matching algorithm
│   ├── prisma.ts               Prisma client singleton
│   ├── registry.ts             Israeli Companies Registry lookup (data.gov.il)
│   ├── research.ts             AI web research via Claude
│   ├── scoring.ts              Developer quality score computation
│   └── __tests__/              Jest unit tests for matching + ledger
├── prisma/
│   ├── schema.prisma           Database schema (11 models)
│   ├── prisma.config.ts        CLI config (datasource URL, seed command)
│   └── migrations/             SQLite migration history
├── scripts/
│   ├── seed.mjs                Seed buyer + seller + demo unit types
│   ├── seed-developer.mjs      Seed developer accounts + projects + offers
│   └── seed-transcript.mjs     Seed realistic buyer interview transcript
├── public/                     Static images (screenshots for docs)
├── dev.db                      SQLite database (development)
├── next.config.ts              Next.js configuration
├── package.json                Dependencies and scripts
├── tsconfig.json               TypeScript config
└── prisma.config.ts            Prisma CLI config (root-level)
```

### Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.11 |
| UI | React + React DOM | 19.2.4 |
| Language | TypeScript | 5.x |
| Database ORM | Prisma Client | 7.9.0 |
| Database driver | better-sqlite3 (via Prisma adapter) | 13.0.1 |
| Database | SQLite (dev.db) | — |
| Auth | bcryptjs (password hash) | 3.0.3 |
| Auth | jsonwebtoken (JWT, 7d expiry) | 9.0.3 |
| AI / LLM | Anthropic SDK (`@anthropic-ai/sdk`) | 0.113.0 |
| AI model used | claude-sonnet-4-6 | — |
| Avatar / voice | livekit-client (WebRTC) | 2.20.2 |
| PDF parsing | pdf-parse | 2.4.5 |
| Styling | Tailwind CSS | 4.x |
| Testing | Jest | — |
| Dev server | Next.js `--turbopack` | — |

---

## 2. Existing Modules

### 2a. Registration / Login

**Buyer registration** (`POST /api/auth/register` → `app/api/auth/register/route.ts`):
1. Accept email, password, role (default `"buyer"`).
2. Validate uniqueness, hash password (bcryptjs, 12 rounds).
3. Create `User` row.
4. Return signed JWT (payload: `{userId, email, role}`, 7-day expiry).

**Buyer login** (`POST /api/auth/login` → `app/api/auth/login/route.ts`):
1. Look up `User` by email, verify password.
2. Return JWT.

**Developer registration** (`POST /api/dev/register` → `app/api/dev/register/route.ts`):
1. Accept company details (companyName, crn, contactName, phone), account credentials, and a three-field questionnaire (yearsExperience, completedProjects, companyDescription).
2. Compute a `baselineScore` (0–100) by calling Claude Sonnet with the questionnaire answers.
3. Create `User` (role `"developer"`) + `DeveloperProfile` (crnStatus `"pending"`, qualityScore = baselineScore, questionnaireAnswers stored as JSON).
4. Fire two background tasks (non-blocking `void`):
   - `performAndStoreResearch()` → `webResearchSummary`
   - `performAndStoreRegistryLookup()` → `registryLookupResult`
5. Return `{userId, crnStatus: "pending", baselineScore}` — **no JWT issued**. Developer waits for admin approval.

**Developer login** (handled by same `POST /api/auth/login` route):
- Same JWT flow; after login, developer is redirected based on `crnStatus` (`/dev/dashboard`, `/dev/pending`, or `/dev/rejected`).

**Connected pages:** `/(auth)/login`, `/(auth)/register`, `/dev/login`, `/dev/register`, `/dev/pending`, `/dev/rejected`.

---

### 2b. Authentication

**Implementation:** Stateless JWT with manual header extraction. No session store, no cookies.

**`lib/auth.ts` exports:**
- `hashPassword(password) → Promise<string>` — bcryptjs, 12 salt rounds.
- `verifyPassword(password, hash) → Promise<boolean>`.
- `signToken({userId, email, role}) → string` — `jwt.sign`, 7-day expiry.
- `verifyToken(token) → JwtPayload` — throws on invalid.
- `extractToken(authHeader) → JwtPayload | null` — strips `"Bearer "` prefix, returns `null` on any error.

**Route protection:** Each protected API route calls `extractToken(req.headers.get("Authorization"))` and returns 401 if null. Role is checked inline (e.g., `payload.role !== "developer"`).

**Identity / phone / document verification:**  
There is **no ID document verification, no phone OTP, no KYC check** implemented in the code. Phone numbers are stored as plain strings (no validation). CRN is verified only via the companies-registry lookup (Section 2f below); there is no government identity linkage. This is an explicit gap relative to a production system.

---

### 2c. User Profile (BuyerProfile / DeveloperProfile)

**BuyerProfile model:**
- `userId`, `expectedScore` (ēj), `minAcceptanceScore` (āj), `preferences` (JSON blob), `updatedAt`.
- Created/updated by `POST /api/characterize` after the interview transcript is analyzed by Claude.
- Preferences include: property_type, location, bedrooms, bathrooms, must_haves[], dealbreakers[], timeline, additional_notes.

**DeveloperProfile model:**
- `companyName`, `crn`, `contactName`, `phone`, `crnStatus`, `qualityScore`, `baselineScore`, `behaviorScore`, `questionnaireAnswers` (JSON), `webResearchSummary` (JSON), `registryLookupResult` (JSON).
- `qualityScore` is computed as `round(0.5 * baselineScore + 0.5 * behaviorScore)` and refreshed by `lib/scoring.ts:refreshDeveloperQualityScore()` after every offer action.

---

### 2d. Matching

**Algorithm:** Zij optimization (`lib/matching.ts`).

**Inputs per candidate pair:**
- Buyer: `expectedScore` (ēj — ideal), `minAcceptanceScore` (āj — walk-away floor).
- AOM / unit type: `eil` (seller's minimum listing score), `ail` (seller's target/asking score).

**Computation:**
```
lowerBound = max(eil, āj)
upperBound = min(ēj, ail)
feasible   = lowerBound ≤ upperBound
pfij       = upperBound        (maximize Zij linearly)
Zij        = 2·pfij - eil - ēj
```

**Route:** `POST /api/match/route.ts`
1. Fetch all active `UnitType` rows.
2. Map to `AomCandidate[]` and call `matchBuyerToAoms()`.
3. Persist valid matches as `MatchResult` rows.
4. Append three ledger blocks (buyer, seller, aom_rating chains).
5. Return `{ranked: MatchOutcome[], validCount, totalCandidates, chainIntegrity}`.

**Results page** (`/results`): reads `sessionStorage["matchResults"]`, renders `MatchCard` components sorted by Zij descending. Each card shows an alignment bar — seller range [eil, ail] vs buyer range [āj, ēj] — and highlights the feasible overlap.

---

### 2e. Transaction / Negotiation

**Offer lifecycle:**

| Step | Route | Actor |
|---|---|---|
| Submit offer | `POST /api/offers` | Buyer |
| List offers | `GET /api/dev/offers` | Developer |
| Respond | `POST /api/dev/offers/[id]/respond` | Developer |

Offer statuses: `pending → accepted / rejected / countered`.  
Counter-offer adds `counterPrice` + `counterTerms` to the `Offer` row.  
After each developer response, `refreshDeveloperQualityScore()` is called to update `behaviorScore` and `qualityScore`.

**Leverage groups** (multi-buyer bulk negotiation):
- `LeverageGroup` model: `memberCount`, `requestedDiscountPercent`, `requestedTerms`, `status`, `counterDiscountPercent`, `counterTerms`.
- Developer responds via `POST /api/dev/leverage-groups/[id]/respond`.
- Groups are currently seeded via scripts; there is no buyer-facing UI to form a group.

**What is NOT implemented:** There is no final transaction-closing or escrow step. Accepting an offer changes its `status` to `"accepted"` and decrements `UnitType.quantityAvailable` (not confirmed from code — status update only; quantity bookkeeping may be absent). No payment, no contract generation, no legal handoff.

---

### 2f. Developer Verification (Phases 3 + 4)

**Phase 3 — AI web research** (`lib/research.ts`):
- Called as a background `void` on developer registration; re-triggerable by admin via `POST /api/dev/admin/research/[id]`.
- Uses Claude Sonnet (`claude-sonnet-4-6`) with the `web_search_20260209` server-side tool.
- Up to 5 rounds (re-sends on `pause_turn`); extracts first `{...}` JSON block from `end_turn` response.
- Stores `{ summary, foundOnlinePresence, flagsOrConcerns }` in `DeveloperProfile.webResearchSummary`.
- Graceful failure: stores `"Research unavailable"` JSON string on error, never throws.

**Phase 4 — Companies registry lookup** (`lib/registry.ts`):
- Called as a background `void` on developer registration; re-triggerable by admin via `POST /api/dev/admin/registry/[id]`.
- Queries the **data.gov.il CKAN API** (Ministry of Justice; dataset `ica_companies`; resource ID `f004176c-b85f-4542-8901-7b3176f9a054`; updated daily). Filters by exact CRN (`מספר חברה`).
- Extracts: `שם חברה` (Hebrew name), `שם באנגלית` (English name), `סטטוס חברה` (status), `סוג תאגיד` (entity type), `תאריך התאגדות` (incorporation date).
- Name comparison: normalize both sides (lowercase, strip legal suffixes `ltd/bv/inc/llc/בעמ/בע"מ`, collapse whitespace), check substring inclusion in either direction.
- Flags surfaced: CRN not found, name mismatch, status ≠ `"פעילה"` (active).
- 15-second fetch timeout; UNAVAILABLE result on any error.
- Stores `RegistryLookupResult` JSON in `DeveloperProfile.registryLookupResult`.

**Admin review page** (`/dev/admin/approvals` → `app/dev/admin/approvals/page.tsx`):
- No authentication required (prototype admin, not linked from nav).
- Two collapsible sections per profile: "AI web research" and "Companies registry lookup".
- Both show human-readable flags in red, status/detail fields, and a "Run …" button to re-trigger.
- Approve / Reject buttons always enabled regardless of research/registry completion.

---

### 2g. Scoring

**`lib/scoring.ts`:**

`computeBehaviorScore(developerId, baselineScore) → Promise<BehaviorBreakdown>`:
- Fetches all `Offer` rows where `developerId` matches.
- **Responsiveness (40%):** Mean response time in hours across all offers. For unresolved (pending) offers, time = now − `createdAt`. For resolved, time = `updatedAt` − `createdAt`. Linear decay 0 h → 100, 168 h → 0, clamped [0, 100].
- **Resolution rate (35%):** `count(status ≠ "pending") / total`.
- **Engagement rate (25%):** `count(status = "accepted" or "countered") / total`.
- Zero offers → `behaviorScore = baselineScore`.

`refreshDeveloperQualityScore(developerId)`:
- Calls `computeBehaviorScore`, then:
  - `qualityScore = round(0.5 * baselineScore + 0.5 * behaviorScore)`
  - Persists both `behaviorScore` and `qualityScore` to `DeveloperProfile`.

---

## 3. Blockchain — Most Important Section

### What Is Implemented

There is **no real blockchain** in the codebase. What exists is a **simulated, in-memory, hash-linked ledger** implemented in `lib/ledger.ts`. It models the structural concept from the patent (three independent chains) but is not decentralized, not persistent, and does not use any blockchain network or SDK.

### Structure

Three independent chains, each an in-memory `Block[]` array:

| Chain name | What it records |
|---|---|
| `"buyer"` | `{event: "match_request", buyerId, buyerProfile, timestamp}` |
| `"seller"` | `{event: "seller_prefs_recorded", unitTypeId, sellerId, eil, ail, timestamp}` |
| `"aom_rating"` | `{event: "ratings_written", buyerId, results: [{unitTypeId, pfij, zij, valid}], timestamp}` |

**Block structure:**
```typescript
{
  index: number,
  timestamp: string,          // ISO-8601
  data: unknown,              // JSON-serializable payload
  previousHash: string,       // hash of previous block (or 64 zeroes for genesis)
  hash: string                // SHA-256(index + timestamp + JSON.stringify(data) + previousHash)
}
```

### Where the Code Lives

| Function | File | What it does |
|---|---|---|
| `appendBlock(chain, data)` | `lib/ledger.ts` | Compute SHA-256 hash, append block in memory |
| `getChain(chain)` | `lib/ledger.ts` | Return snapshot of a chain |
| `verifyChain(chain)` | `lib/ledger.ts` | Re-compute hashes, check `previousHash` links |
| `verifyAllChains()` | `lib/ledger.ts` | Verify all three chains |
| `resetChains()` | `lib/ledger.ts` | Clear all chains (test-only) |

### Write Points

Ledger is written **only in `POST /api/match/route.ts`**, once per match request:
1. Append block to `"buyer"` chain (buyer profile + request metadata).
2. Append block to `"seller"` chain (seller/AOM preferences for all candidates).
3. Append block to `"aom_rating"` chain (all match outcomes with Zij scores).

### Read Points

- `GET /api/ledger` — returns chain contents and integrity status for one or all chains.
- `POST /api/match` — returns `chainIntegrity` in the response body.
- `lib/__tests__/` — Jest tests for ledger and matching.

### Persistence

**None.** The `Block[]` arrays live in application process memory. They are lost on server restart. There is **no write to the SQLite database** from `lib/ledger.ts` (the `LedgerBlock` model exists in the schema but is **not used** by any current code path — it is an unpopulated table).

### Integration Hook

The real integration point for a production blockchain is the `appendBlock` calls in `app/api/match/route.ts`. Replacing the in-memory `lib/ledger.ts` implementation with calls to an actual blockchain SDK (e.g., Ethereum/ethers.js, Hyperledger, or a custom smart-contract interface) at those three call sites would complete the integration. The `LedgerBlock` model in `prisma/schema.prisma` appears intended as a durable cache/mirror of on-chain data, but nothing writes to it today.

---

## 4. Data Flow

### User Journey Diagram

```
BUYER SIDE
──────────────────────────────────────────────────────────────────────

  ① Register / Login
     POST /api/auth/register  →  User{role="buyer"} created
     POST /api/auth/login     →  JWT returned, stored in localStorage

  ② Interview (Avatar)
     GET  /api/liveavatar/session  →  LiveKit room credentials
     [WebRTC session with avatar]
     Transcript lines buffered in browser memory

     POST /api/transcript  →  Transcript{raw: JSON[]} saved
                              transcriptId → localStorage

  ③ Characterization
     POST /api/characterize  →  Claude Sonnet reads Transcript
                                Extracts {ēj, āj, preferences}
                                Upserts BuyerProfile{expectedScore, minAcceptanceScore, preferences}
                                Returns CharacterizationResult

     DEMO PATH: POST /api/demo/parse-pdf  (PDF upload instead of transcript)

  ④ Matching
     GET  /api/aom           →  All active UnitType[] (AOM candidates)
     POST /api/match         →  Zij algorithm runs over candidates
                                MatchResult rows persisted (valid matches only)
                                3 ledger blocks appended (buyer / seller / aom_rating)
                                Returns {ranked, validCount, chainIntegrity}

  ⑤ Results
     /results page           →  Reads sessionStorage["matchResults"]
                                Renders MatchCard[] sorted by Zij descending
                                Shows alignment bar (seller range vs buyer range)

  ⑥ Offer Submission
     POST /api/offers        →  Offer{status:"pending"} created
                                matchScore (pfij) attached server-side
                                UnitType.aomStatus may change to "in_negotiation"

DEVELOPER SIDE
──────────────────────────────────────────────────────────────────────

  ① Register
     POST /api/dev/register  →  Claude scores questionnaire → baselineScore
                                DeveloperProfile{crnStatus:"pending"} created
                                [background] AI web research → webResearchSummary
                                [background] Registry lookup → registryLookupResult
                                No JWT issued; developer waits at /dev/pending

  ② Admin Review (no auth)
     GET  /api/dev/admin/approvals          →  All profiles with research + registry data
     POST /api/dev/admin/research/[id]      →  Re-trigger web research (sync, admin page)
     POST /api/dev/admin/registry/[id]      →  Re-trigger registry lookup
     POST /api/dev/admin/approve/[id]       →  crnStatus → "approved" or "rejected"

  ③ Login (post-approval)
     POST /api/auth/login    →  JWT returned; /dev/dashboard unlocked

  ④ Manage Listings
     GET  /api/dev/projects                  →  Developer's projects + unit types
     POST /api/dev/projects                  →  Create project
     POST /api/dev/projects/[id]/unit-types  →  Create unit type (AOM)
     PUT  /api/dev/unit-types/[id]           →  Edit unit type
     DELETE /api/dev/unit-types/[id]         →  Deactivate unit type

  ⑤ Respond to Offers
     GET  /api/dev/offers              →  Incoming offers (with matchScore, buyer email)
     POST /api/dev/offers/[id]/respond →  Accept / Reject / Counter
                                         → refreshDeveloperQualityScore() called

  ⑥ Respond to Leverage Groups
     GET  /api/dev/leverage-groups              →  Incoming bulk-discount requests
     POST /api/dev/leverage-groups/[id]/respond →  Accept / Reject / Counter

LEDGER (parallel to matching)
──────────────────────────────────────────────────────────────────────

  POST /api/match  →  appendBlock("buyer", {buyerProfile})
                   →  appendBlock("seller", {aomCandidates})
                   →  appendBlock("aom_rating", {matchOutcomes})

  GET  /api/ledger?chain=buyer|seller|aom_rating
                   →  Returns blocks + verifyChain() result
```

---

## 5. Gaps and TODOs

### Gaps vs. Patent / Design Intent

| Area | What the Design Expects | What Exists Today |
|---|---|---|
| **Blockchain** | Three live distributed chains (buyer preferences, seller preferences, AOM ratings) with immutable on-chain writes | In-memory hash-chain simulation in `lib/ledger.ts`; `LedgerBlock` table in schema is **never written to** |
| **Ledger persistence** | On-chain or durable storage of match events | Lost on server restart; `LedgerBlock` table unused |
| **Identity verification** | Verified identity documents, government ID, or phone OTP for buyers and sellers | No KYC; phone stored as plain string; buyer email/password only |
| **Seller / Developer CRN ownership proof** | Cryptographic or government-verified proof that the registrant controls the CRN | Registry lookup checks name/status but not ownership; no document upload |
| **Buyer group formation UI** | Buyers can form leverage groups to negotiate collectively | `LeverageGroup` model and developer-response route exist; **no buyer-facing UI** to form or join a group |
| **Transaction closing** | Contract generation, escrow, payment, legal handoff | Accepting an offer sets `status = "accepted"`; nothing beyond that |
| **Quantity bookkeeping** | Sold-out unit types should become unavailable to new buyers | `quantityAvailable` field exists; no code decrements it on offer acceptance |
| **Seller (non-developer) role** | `role = "seller"` present in User model | Seeded but no seller-specific pages or routes exist |
| **Interview in production** | Full uninterrupted avatar conversation before redirect to processing | `/interview` page auto-navigates after 5 seconds (hardcoded DEMO behaviour) |
| **PDF processing in production** | PDF path is a demo shortcut | `POST /api/demo/parse-pdf` is labelled DEMO and intended to be removed |
| **Buyer result debug panel** | Internal only | `DEMO_SHOW_PROFILE` constant in `/results/page.tsx` — intended to be set to `false` before production |
| **Auth for admin approvals** | Admin should be authenticated | Admin page has no auth guard (explicitly noted as "prototype") |
| **Notifications** | Buyer/developer notification on offer status change | None — no email, push, or in-app notification system |

### DEMO / Pre-Production Flags in Code

| File | Flag / Pattern | Notes |
|---|---|---|
| `app/interview/page.tsx` | Auto-navigation timer (5-second countdown) | Labelled "DEMO ONLY — remove before production" |
| `app/processing/page.tsx` | PDF upload path and "Use demo transcript" button | Labelled "DEMO ONLY" |
| `app/results/page.tsx` | `DEMO_SHOW_PROFILE = true` | Shows raw characterization JSON; set to false before production |

### No TODO/FIXME Comments Found

A full-codebase search found **no `TODO`, `FIXME`, `HACK`, or `XXX` comments** in the source files (outside node_modules, .next, .git). All known gaps are conveyed via inline comments labelled "DEMO ONLY" in the three files above.
