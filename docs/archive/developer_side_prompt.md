We're now building the developer/contractor side (the "seller" role in the
patent — seller, lessor, agent, or broker). This is a separate user type from
the buyer, with a completely different registration flow and a persistent
management dashboard (not a one-time emotional flow like the buyer's
avatar interview).

Keep everything on the buyer side untouched. This is additive.

## 1. Data model additions

Add a `developer` user role alongside the existing `buyer` role. A developer
account needs:
- company_name
- crn (company registration number)
- contact_name, phone, email
- password
- crn_status: enum `pending` | `approved` | `rejected` (default `pending`)
- quality_score: integer, default a static placeholder value (e.g. 82) —
  no real scoring algorithm needed yet, just a number the UI can display

Add/upgrade the AOMs table to support full CRUD (not just the seed form from
phase 1): each AOM belongs to a developer_id, has status
`available` | `in_negotiation` | `sold`, plus the existing AOM fields
(price, terms, type, etc. — reuse whatever fields already exist from the
seed form).

Add two new tables:
- `offers`: buyer_id, aom_id, developer_id, offered_price, terms (text),
  status: `pending` | `countered` | `accepted` | `rejected`,
  counter_price (nullable), counter_terms (nullable)
- `leverage_groups`: aom_id, developer_id, member_count (integer),
  requested_discount_percent, requested_terms (text),
  status: `pending` | `countered` | `accepted` | `rejected`,
  counter_discount_percent (nullable), counter_terms (nullable)

For now, seed `offers` and `leverage_groups` with a handful of realistic
mock rows (2-3 each) tied to existing AOMs, so the dashboard has something
to show. We'll wire these to the real buyer flow later.

## 2. Registration flow (developer)

Separate registration form from the buyer's — this is a B2B form, not a
video interview. Fields: company name, CRN, contact name, phone, email,
password.

On submit, do NOT go straight to the dashboard. Show a "pending verification"
screen:
- Message communicating that the company details were submitted for
  verification against the companies registry and require attorney
  (licensed solicitor) sign-off — professional, calm tone, not alarming.
- Status indicator (e.g. a simple stepper or spinner state) showing
  "pending review"

For this prototype, simulate the approval with a hidden/simple mechanism:
add a route like `/dev/admin/approvals` (not linked from any real nav) that
lists pending developer accounts with an "Approve" / "Reject" button —
this stands in for the "licensed solicitor" role for now. Once approved,
the developer can log in and reach the dashboard; if rejected, show a
rejection message with a support contact placeholder.

Do not auto-approve after a timer — we want the pending state to be a real,
visible state in the product, not just a loading spinner.

## 3. Developer dashboard

Three sections on one dashboard page:

**a. My AOMs**
- List of the developer's AOMs with status badges (available / in
  negotiation / sold)
- Add new AOM (upgrade the existing seed form into a real create form)
- Edit existing AOM
- This replaces/upgrades the old seed-only form — keep the same
  underlying AOM fields, just make it a full CRUD panel scoped to the
  logged-in developer

**b. Incoming Offers (individual buyers)**
- One card per offer: buyer identifier, related AOM, offered price, terms,
  current status
- Actions: Accept / Reject / Counter (counter opens an inline form for
  counter_price + counter_terms)

**c. Leverage Groups**
- One card per group: related AOM, member_count, requested_discount_percent,
  requested_terms, current status
- Same action pattern: Accept / Reject / Counter (counter form for
  counter_discount_percent + counter_terms)
- Visually distinguish these cards from individual offers (e.g. a group
  icon/badge showing member_count) so it's immediately clear this is a
  multi-buyer negotiation, not a single offer — but reuse the same
  accept/reject/counter interaction pattern as individual offers for
  consistency

Show the quality_score somewhere prominent on the dashboard (e.g. top of
page, simple badge/number — no need for a breakdown yet).

## 4. Design consistency

Match the existing visual language from the buyer side (the professional,
non-generic look already established — paper/ink tones, JetBrains Mono for
technical labels, no color-only status indicators). Same accessibility
rule as before: never rely on color alone for status (pending/accepted/
rejected should each have a clear text label, not just a colored dot).

Show me screenshots of: the developer registration form, the pending
verification screen, the hidden admin approval page, and the full
dashboard (with at least one item in each of the three sections) when done.
