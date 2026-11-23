# Haveniq — legal review packet (for an Israeli solicitor)

Prepared 2026-11-23. Every text below is a **draft** written by the product team, not by counsel. Nothing here should be published as final until a qualified Israeli lawyer has reviewed and approved it.

## 1. Texts to review

| Text | Where | Notes |
| --- | --- | --- |
| Privacy Policy (he / en) | `/privacy` — source `lib/legal/content.ts` | Draft banner on the page. Open questions in square brackets. |
| Terms of Service (he / en) | `/terms` — same source | Draft banner on the page. Open questions in square brackets. |
| Cookie notice | `components/CookieNotice.tsx` | Information notice with dismiss. Cookies are strictly necessary only. |
| Reservation contract wording | `app/deal/[offerId]/page.tsx` (`contractText`, messages `deal.contract*`) | Marked as a draft and as a simulation. |
| Deal Room PDF disclaimer | `app/api/deal/[offerId]/pdf/route.ts` (`HE` / `EN` disclaimer strings) | "Not a legally binding contract. No money has been collected." |
| Simulation labels | Deal Room, PDF, Terms §3 | Decide whether to keep or remove the "simulation" wording. |
| Accessibility statement | `/terms` §8 | Draft commitment to Israeli standard SI 5568 (WCAG 2.0 AA). |

## 2. Questions for counsel

1. **Digital signature and contract.** Is the typed name plus drawn signature image, shown in the Deal Room, legally sufficient under the Israeli Electronic Signature Law, for any use? Or should the flow be presented strictly as a non-binding record?
2. **Brokerage licensing.** Does presenting listings and matching buyers to developers and private sellers require a real estate agent licence (Real Estate Agents Law)? Do offers, reservations or deposits change that answer?
3. **Deposits.** Confirm the wording of the simulated "reservation deposit" so no party can reasonably believe real money has moved.
4. **Privacy.** Confirm the lawful basis and notice requirements under the Protection of Privacy Law 5741-1981 and its amendments, including: interview audio and video, AI-generated profiles, and the transfer of data to service providers that may be located outside Israel.
5. **Database registration.** Does any registration or notification obligation apply to the Platform's databases?
6. **Retention.** Exact retention periods for account data, interview data, transaction records and ledger records, and how erasure requests are handled while legal records must be kept.
7. **Cookies.** Confirm that the notice (not an opt-in banner) is sufficient, because only strictly necessary cookies are set.
8. **Terms.** Governing law (Israel), exclusive jurisdiction (proposed: Tel Aviv district courts), limitation of liability and its enforceability for consumers, minimum age (18), and developer approval.
9. **Accessibility.** Confirm the obligation and the standard to be met, and the wording of the accessibility statement.
10. **Hebrew text.** Review the Hebrew translations of both documents. They were written in the product team's own Hebrew and must be checked for legal accuracy.

## 3. Facts about the product that counsel needs

- **Personal data collected:** account (email, name, phone, password hash, company details for developers and sellers), interview audio/video and transcripts, derived preference profiles, offers and negotiation history, signature image and typed name, usage logs.
- **Service providers that receive data on Haveniq's behalf:** conversational AI and voice (ElevenLabs), avatar video (HeyGen), language-model analysis (Anthropic), database and hosting (Neon, and the host that runs the app), email (Gmail SMTP), Google Calendar (optional, only if the user connects it). **Locations and contracts (DPAs) for each still need to be confirmed.**
- **Cookies:** `hq_session` (httpOnly login cookie) and `locale` (language preference). No analytics or advertising cookies.
- **Account deletion:** requested from the Profile page (sends an email to support); no automated erasure flow yet.
- **Support address used in the texts:** `support@haveniq.com` (already in the app). Confirm it is the right address.

## 4. What is not yet decided

- The "simulation" labels: keep until the payment and signing flows are real, or remove them now.
- Whether real deposits or payment processing will be offered (this would change the Terms and the licensing answer above).
