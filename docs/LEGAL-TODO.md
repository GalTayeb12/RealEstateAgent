# Legal texts requiring solicitor review before go-live

This file lists every user-facing legal or quasi-legal text in the product
that **must be reviewed and approved by a qualified Israeli lawyer** before
the platform goes live or is shown to real buyers and sellers.

---

## 1. Property Reservation Agreement (Deal Room contract)

**File:** `app/deal/[offerId]/page.tsx` → `contractText` variable (messages via `m.deal.contract*`)  
**Messages keys:** `he/en.deal.contractHeader`, `contractBody`, `contractDisclaimer`

Current Hebrew draft (marked "נוסח טיוטה – כפוף לאישור משפטי"):
> "שני הצדדים מאשרים את כוונתם להשלים את העסקה בליווי עורכי דין."

Current English draft:
> "Both parties confirm their intention to proceed to legal completion of this sale, to be carried out in person with instructed solicitors."

**Issues to resolve:**
- Is a digital signature on this form legally valid under Israeli law (Signatures Law 5761-2001)?
- Does the platform need to be registered as a regulated real-estate broker to present this form?
- Disclaimer language must be vetted — "simulation for demonstration purposes only" may not be sufficient to disclaim liability if a party acts on this document.
- The "reservation deposit" simulation must not imply a real financial transaction; confirm the wording achieves this.

---

## 2. Terms of Service (`/terms`)

**File:** `app/terms/page.tsx`

**Issues to resolve:**
- Governing law clause (currently absent or generic) — must specify Israeli jurisdiction.
- Limitation of liability for property matching errors.
- Data retention and deletion rights (see also Privacy Policy).
- Age of majority / legal capacity requirements for buyers.
- Real estate agency disclosure requirements under Israeli law (Real Estate Agents Law 5756-1996).

---

## 3. Privacy Policy (`/privacy`)

**File:** `app/privacy/page.tsx`

**Issues to resolve:**
- Compliance with Israeli Privacy Protection Law (5741-1981) and its 2023 amendments.
- Database registration requirements with the Israeli Privacy Authority (if personal data is stored on a registered database).
- Cookie consent mechanism — currently a locale cookie is set without an explicit consent banner.
- Cross-border data transfer provisions (if DB / hosting is outside Israel).
- Right to erasure / correction procedure must be described.

---

## 4. Deal Summary PDF disclaimer

**File:** `app/api/deal/[offerId]/pdf/route.ts` → strings `HE.disclaimer*` / `EN.disclaimer*`

Current text (English):
> "This document confirms that the above property has been reserved subject to contract.
> This is not a legally binding contract. No money has been collected by this platform.
> Please instruct a solicitor to proceed."

**Issues to resolve:**
- "Subject to contract" is a UK/common-law concept; verify the Hebrew equivalent ("בכפוף לחוזה") carries the same non-binding implication under Israeli contract law.
- Confirm the platform is not deemed to have brokered a transaction by generating this document.

---

## 5. Recommendation disclaimer (Next Steps section on /results)

**File:** `lib/i18n/messages.ts` → `results.recs.*.blurb`

The moving, insurance, and furniture blurbs are informational and low-risk,
but if the platform ever earns a referral fee from these services it must
comply with Israeli consumer-protection disclosure requirements.

---

## Checklist before go-live

- [ ] Lawyer review of contract text (§1)
- [ ] Lawyer review of Terms of Service (§2)
- [ ] Lawyer review of Privacy Policy (§3)
- [ ] Lawyer review of PDF disclaimer (§4)
- [ ] Real estate agency licensing check
- [ ] Privacy Authority database registration check
- [ ] Cookie consent banner implementation
- [ ] Remove all "SIMULATION" / "סימולציה" labels — or keep them and confirm
      they are legally sufficient to disclaim the document's non-binding nature
