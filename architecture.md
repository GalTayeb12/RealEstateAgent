# AOM Matching Platform — Prototype Spec

## 1. Purpose

This is a proof-of-concept build for a buyer/seller matching platform based on the patent
"System and Method for Matching Buyers with Sellers" (2754-M-01-IL). The prototype must
demonstrate two things at once:

1. **Technical feasibility** — a working implementation of the patent's core matching
   algorithm (Figures 1–4) and its distributed-ledger recordkeeping concept.
2. **A client/investor-facing demo** — a polished, cinematic front-end experience showing
   an AI avatar interviewing a buyer, characterizing them automatically, and producing a
   ranked match.

Everything not needed for this end-to-end story is explicitly out of scope for v1 (see
Section 7).

## 2. End-to-end flow

```
[Register / Login — polished dashboard]
              │
   Screen "power-off" effect (visual + sound)
              │
              ▼
[Large AI Avatar — live conversation]
   ElevenLabs Conversational AI (agent, STT, TTS, live transcript)
   + Mascotbot SDK (real-time lip sync driven off the ElevenLabs audio stream)
   Avatar asks a predefined set of questions, like a real interviewer
              │
   Full transcript captured (saved as a file/record)
              │
              ▼
[Claude API — conversation characterization]
   Transcript → structured JSON:
     - buyer preferences
     - expected score (ēj) / minimum acceptance score (āj)
     - behavioral & intent insights
   This is the system's IDUP (Interactive Digital User Profile), per the patent.
              │
              ▼
[Matching Engine — Zij optimization]
   max Zij = (pfij - eil) - (ēj - pfij)
   subject to: ēj ≥ pfij ≥ eil  and  pfij between āj and ail
   Every step (buyer prefs, seller/AOM prefs, resulting AOM-MP) is written to one of
   three hash-chained ledgers (buyer ledger / seller ledger / AOM rating ledger),
   mirroring the patent's three-blockchain structure. No direct buyer↔seller channel —
   everything is mediated by the matching engine, per the patent.
              │
              ▼
[Results Dashboard]
   Buyer sees ranked AOM matches (pfij, Zij) + rationale from the characterization step.
```

## 3. Components to build

### 3.1 Auth & Dashboard shell
- Simple email/password registration & login.
- Buyer dashboard shell (this is the "before" state, prior to the avatar interview).
- Seller/AOM entry: a simpler form-based flow (no avatar needed for v1) to seed AOM
  listings with `eil`, `ail`, and descriptive attributes — this is the counterpart data
  the matching engine needs.

### 3.2 "Power-off" transition
- CSS/JS effect: screen flicker → fade to black.
- Paired sound effect (short "power-down" clip; source a royalty-free asset).
- Triggers automatically right after successful login, before the avatar view mounts.

### 3.3 Avatar interview
- **ElevenLabs Conversational AI**: create an Agent with a system prompt containing the
  fixed set of interview questions and interviewer persona/tone.
- Client SDK `@elevenlabs/client` manages the live session: audio in/out + live
  transcript events.
- **Mascotbot SDK** taps the same audio stream (no changes to the ElevenLabs client code)
  and drives lip-sync on a `.riv` avatar asset. Start with one of Mascotbot's stock demo
  avatars; swap in a custom one later.
- On session end: assemble the full transcript (both sides of the conversation) into a
  single record/file.

### 3.4 Characterization step
- Send the full transcript to the Claude API with a structured-output prompt.
- Expected response shape:
```json
{
  "buyer_preferences": { "...": "..." },
  "expected_score_ej": 0.0,
  "min_acceptance_score_aj": 0.0,
  "behavioral_insights": "string",
  "intent_signals": "string"
}
```
- This JSON becomes the buyer's IDUP record, feeding directly into the matching engine.

### 3.5 Matching engine
- Pure function implementing the Zij optimization from Figure 1, given a buyer profile
  and a set of candidate AOMs.
- Returns, per candidate: `pfij`, `Zij`, and pass/fail against the acceptance-range
  constraints.
- Every matching run writes an entry to the three simulated ledgers (see 3.6).

### 3.6 Simulated blockchain (three ledgers)
- Real hash-chained data structure (not a distributed network — that's out of scope):
  each block = `{ index, timestamp, data, previous_hash, hash }`.
- Three separate chains: buyer-preference chain, seller/AOM-preference chain,
  AOM-rating chain — matching the patent's structure and its "no direct buyer↔seller
  communication" constraint.
- Expose a simple viewer (even just a JSON/table view) so the chain and its integrity
  (hash linkage) can be shown to a client.

### 3.7 Results dashboard
- Ranked list of AOMs for the buyer, sorted by `Zij`/`pfij`.
- Show the characterization insights alongside each match as rationale.

## 4. Suggested tech stack
- **Frontend**: Next.js + React + Tailwind
- **Backend**: Next.js API routes (keep it in one app for a prototype — no separate
  backend service needed yet)
- **DB**: SQLite (single file, zero ops overhead)
- **Blockchain sim**: hand-rolled JS module — no external library, fully transparent
- **Voice/Avatar**: ElevenLabs Conversational AI + Mascotbot SDK
- **Characterization**: Claude API (Sonnet)

## 5. Environment variables / accounts needed before starting
| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | Conversational AI agent + STT/TTS |
| `ELEVENLABS_AGENT_ID` | The configured interview agent |
| `MASCOTBOT_API_KEY` | Real-time lip-sync proxy |
| `ANTHROPIC_API_KEY` | Claude API for transcript characterization |

A `.riv` avatar file is also needed (start with a Mascotbot stock demo asset).

## 6. Suggested folder structure
```
/app
  /(auth)/login
  /(auth)/register
  /dashboard              # buyer shell, pre-interview
  /interview              # power-off transition + avatar screen
  /results                # ranked matches
  /api
    /transcript           # save/retrieve interview transcript
    /characterize         # POST transcript -> Claude -> IDUP JSON
    /match                # POST buyer IDUP + AOM list -> Zij ranking
    /ledger                # GET/POST to the three simulated chains
/lib
  /matching.ts            # Zij optimization
  /ledger.ts              # hash-chain implementation
  /elevenlabs.ts           # agent session helpers
/db
  schema + seed data (buyers, AOMs)
```

## 7. Explicitly out of scope for v1
- Real distributed blockchain network (three ledgers are simulated, in-process).
- Escrow / smart contracts / legal transaction processing.
- Full analytics, engagement tracking, push notifications.
- Custom-trained ML for the IDUP (Claude API characterization stands in for this).
- Multi-buyer / multi-seller negotiation portal (single buyer → ranked AOMs is enough to
  prove the concept).

## 8. Definition of done for the prototype
A user can: register → log in → watch the power-off transition → have a live spoken
conversation with the avatar → see the transcript get characterized → see a ranked list
of matching AOMs with scores → optionally inspect the three ledgers to see the recorded
steps with valid hash chains.
