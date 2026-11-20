# FEATURE_STATUS.md — AOM Matching Platform

> ניתוח פיצ'רים על בסיס סריקת קוד מלאה. תאריך: 2026-08-25.
> **כנות מלאה** — ממצא זה מיועד להצגה מול גורם חיצוני ולא ל-PR.

---

## 1. תקציר כללי

הפרויקט הוא פלטפורמת "AOM Matching" — מנוע התאמה בין רוכשי דירות לדירות מוצע על ידי יזמים. הרוכש עובר ראיון קולי מול אווטאר AI (ElevenLabs/LiveKit), התמלול נשלח ל-Claude שמפיק פרופיל צרכים + ניקוד פסיכומטרי, ואז אלגוריתם Zij (מבוסס פטנט) מדרג את יחידות הדיור לפי התאמה. הפלטפורמה מציגה תוצאות ומאפשרת לרוכש לשלוח הצעת מחיר ליזם. צד היזם כולל הרשמה דו-שלבית עם אימות רגיסטר ישראלי + מחקר רשת (Claude + web_search), דשבורד לניהול פרויקטים, הצעות וקבוצות רכישה. קיים גם נתיב "Leverage Group" לניהול קבוצות רכישה. הלדג'ר הוא סימולציית בלוקצ'יין על גבי SQLite (3 שרשראות hash עם אימות integrity). כל ה-AI processing מבוצע על-ידי Claude Sonnet 4.6.

---

## 2. מיפוי ארכיטקטורה

| שכבה | טכנולוגיה | path |
|------|-----------|------|
| Frontend (pages) | Next.js 16.2.11, React 19.2.4, App Router | `app/` |
| Styling | Tailwind CSS 4.x, CSS custom props | `app/globals.css` |
| API / Backend | Next.js Route Handlers (serverless functions) | `app/api/` |
| ORM / DB | Prisma 7.9.0 + BetterSqlite3 | `prisma/schema.prisma`, `dev.db` |
| Auth | JWT (jsonwebtoken) + bcryptjs | `lib/auth.ts` |
| AI (characterize, score, research) | Anthropic Claude Sonnet 4.6 SDK | `lib/characterize.ts`, `lib/research.ts`, `lib/recommendations.ts` |
| Matching Algorithm | Custom Zij (patent-based) | `lib/matching.ts` |
| Pricing Engine | Elasticity weighting | `lib/elasticity.ts` |
| Blockchain Ledger | Hash-chained blocks (SHA-256, SQLite) | `lib/ledger.ts` |
| Developer Scoring | Quality score = baseline + behavior | `lib/scoring.ts` |
| External Registry | data.gov.il CKAN API (CRN lookup) | `lib/registry.ts` |
| WebRTC (Avatar) | LiveKit client (ElevenLabs agent) | `app/interview/page.tsx` |
| Tests | ts-node / tsx (no Jest runner configured) | `lib/__tests__/` |

---

## 3. טבלת פיצ'רים

### 3.1 Authentication & Accounts

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| הרשמת קונה (email + password) | ✅ קיים ועובד | `app/(auth)/register/page.tsx` → `POST /api/auth/register` |
| התחברות מאוחדת (קונה + יזם) | ✅ קיים ועובד | `app/(auth)/login/page.tsx` → `POST /api/auth/login`; redirect לפי role/crnStatus |
| JWT auth (7-day expiry) | ✅ קיים ועובד | `lib/auth.ts` — Bearer token בכל API call |
| הרשמת יזם (two-step form) | ✅ קיים ועובד | `app/dev/register/page.tsx` → `POST /api/dev/register` |
| אימות יזם ע"י אדמין | ✅ קיים ועובד | `app/dev/admin/approvals/page.tsx` — Approve/Reject/Re-research |
| תפקיד admin (הגדרה ידנית) | 🟡 קיים חלקית | Script בלבד: `scripts/make-admin.mjs` — אין דף הרשמה לאדמין |
| תפקיד seller | ❌ לא קיים | שדה `role="seller"` בסכמה בלבד; אין routes, עמודים, או לוגיקה |
| שחזור סיסמה / שכחתי סיסמה | ❌ לא קיים | — |
| אימות דוא"ל (email verification) | ❌ לא קיים | — |
| KYC / זיהוי מסמכים לרוכשים | ❌ לא קיים | — |

### 3.2 ראיון אווטאר ועיבוד נתונים

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| אנימציית CRT מעבר | ✅ קיים ועובד | `app/transition/page.tsx` — 1.65s collapse animation |
| עמוד ראיון (WebRTC LiveKit) | 🟡 קיים חלקית | `app/interview/page.tsx` — UI קיים, אך auto-navigate של 5 שניות (DEMO FLAG) במקום זיהוי סיום אמיתי |
| שמירת תמלול (transcript) | ✅ קיים ועובד | `POST /api/transcript` + `GET /api/transcript/latest` |
| אפיון רוכש (Claude characterize) | ✅ קיים ועובד | `POST /api/characterize` → `lib/characterize.ts`; ניקוד פסיכומטרי + העדפות + ēj/āj |
| נתיב PDF (חלופה לראיון) | 🟡 קיים — DEMO בלבד | `app/processing/page.tsx` + `POST /api/demo/parse-pdf` — מסומן להסרה |
| טעינה/עיבוד (processing page) | ✅ קיים ועובד | `app/processing/page.tsx` — orchestration של characterize + match |

### 3.3 מנוע התאמה (Matching Engine)

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| אלגוריתם Zij | ✅ קיים ועובד | `lib/matching.ts` — `Zij = 2·pfij − eil − ēj` |
| דירוג AOMs לרוכש | ✅ קיים ועובד | `POST /api/match` — מדרג את כל יחידות הדיור, מחזיר רשימה ממויינת |
| הצגת תוצאות + alignment bars | ✅ קיים ועובד | `app/results/page.tsx` — תרשים חפיפה, ציון Zij, suggested price |
| Elasticity pricing suggestion | ✅ קיים ועובד | `lib/elasticity.ts` — weighted price hint לפי flexibility טווח |
| לדג'ר blockchain (3 chains) | ✅ קיים ועובד | `lib/ledger.ts` — SHA-256 hash chain, integrity verification |
| ניפוי שגיאות/debug panel (BuyerProfile raw) | 🟡 DEMO flag | `DEMO_SHOW_PROFILE = true` ב-`app/results/page.tsx:17` — **חייב להסיר** |

### 3.4 דשבורד קונה

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| הגשת הצעת מחיר לאום | ✅ קיים ועובד | inline form ב-`app/results/page.tsx` → `POST /api/offers` |
| צפייה בהצעות שנשלחו | ❌ לא קיים | אין דף סטטוס הצעות לרוכש |
| אזור אישי / פרופיל רוכש | ❌ לא קיים | אין דף /profile לרוכש |
| התראה על תגובת יזם להצעה | ❌ לא קיים | — |
| קבוצות רכישה — UI צד רוכש | 🟡 קיים חלקית | API קיים (`/api/buyer/leverage-groups`), **עמוד קיים** (`app/buyer/leverage-groups/page.tsx`) — אך אין flow ליצירה מתוך דף התוצאות |
| המלצות שירותים (legal/moving/etc.) | ✅ קיים ועובד | `GET /api/recommendations` → `lib/recommendations.ts`; Claude-generated blurbs עם cache |

### 3.5 דשבורד יזם

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| דשבורד טאבים (Projects/Offers/Groups) | ✅ קיים ועובד | `app/dev/dashboard/page.tsx` |
| יצירת פרויקט + ניהול יחידות | ✅ קיים ועובד | `POST /api/dev/projects`, `POST /api/dev/projects/[id]/unit-types` |
| עריכת / השבתת יחידת דיור | ✅ קיים ועובד | `PATCH /api/dev/unit-types/[id]` |
| קבלת הצעת קונה (Accept/Reject/Counter) | ✅ קיים ועובד | `POST /api/dev/offers/[id]/respond` |
| ניקוד איכות יזם (dynamic scoring) | ✅ קיים ועובד | `lib/scoring.ts` — responsiveness + resolution + engagement |
| ניהול קבוצות רכישה (Accept/Reject/Counter) | ✅ קיים ועובד | `POST /api/dev/leverage-groups/[id]/respond` |
| סטטוס אישור (pending/rejected pages) | ✅ קיים ועובד | `app/dev/pending/page.tsx`, `app/dev/rejected/page.tsx` |
| מחקר רשת אוטומטי (web_search + Claude) | ✅ קיים ועובד | `lib/research.ts` — non-blocking, מאוחסן ב-DeveloperProfile.webResearchSummary |
| בדיקת רגיסטר ישראלי (data.gov.il) | ✅ קיים ועובד | `lib/registry.ts` — CRN lookup + name mismatch detection |

### 3.6 אדמין

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| עמוד אישורי יזמים | ✅ קיים ועובד | `app/dev/admin/approvals/page.tsx` — Approve/Reject/Re-search |
| **AUTH GUARD באדמין** | ❌ **לא קיים — קריטי** | כל routes של `/api/dev/admin/*` פתוחים ללא הגנה |
| ניהול משתמשים (רשימה/מחיקה) | ❌ לא קיים | — |
| Dashboard אנליטיקס / מדדים | ❌ לא קיים | — |

### 3.7 קטלוג AOMs

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| רשימת AOMs לפי יזם | ✅ קיים ועובד | `GET /api/dev/aoms` + `GET /api/aom` |
| כלי seeding (AOM seed) | ✅ קיים ועובד | `app/aom-seed/page.tsx` + `scripts/seed.mjs` |
| דף פרטי AOM | 🟡 לא ברור | קיים `app/aom/[id]/` אך תוכן הדף לא נסרק במלואו |
| מעקב כמות זמינה (`quantityAvailable`) | 🟡 קיים חלקית | שדה קיים בסכמה; **לא מתעדכן** בקבלת הצעה — אין הגנה מפני double-booking |

### 3.8 מסרים / צ'אט

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| הודעות בין קונה ליזם | ❌ לא קיים | — |
| צ'אט real-time | ❌ לא קיים | — |

### 3.9 תשלומים

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| סגירת עסקה / תשלום | ❌ לא קיים | קבלת הצעה מסמנת status=accepted בלבד — אין המשך |
| Escrow / ייפוי כח | ❌ לא קיים | — |
| חוזה דיגיטלי | ❌ לא קיים | — |

### 3.10 התראות

| פיצ'ר | סטטוס | פרטים |
|-------|-------|-------|
| אימייל / SMS בשינוי סטטוס הצעה | ❌ לא קיים | — |
| Push notifications | ❌ לא קיים | — |
| Polling ידני בדף הייתמה יזם | 🟡 קיים חלקית | `app/dev/pending/page.tsx` מבצע polling ל-`/api/dev/me` |

---

## 4. חובות טכניים (Technical Debt) וקוד לא גמור

### DEMO Flags — חייבים להסיר לפני הדגמה

| קובץ | שורה/בעיה | פעולה נדרשת |
|------|-----------|-------------|
| `app/interview/page.tsx` | Timer 5 שניות auto-navigate למקום זיהוי סיום אמיתי | להסיר ולממש event listener של LiveKit |
| `app/processing/page.tsx` | כל בלוק ה-PDF upload + "Use demo transcript" button | להסיר כולו |
| `app/results/page.tsx:17` | `const DEMO_SHOW_PROFILE = true` — חושף raw BuyerProfile JSON | לשנות ל-`false` |
| `app/api/demo/parse-pdf/route.ts` | כל הקובץ — demo path בלבד | למחוק |

### בעיות אבטחה קריטיות

| בעיה | קובץ | סיכון |
|------|------|-------|
| אין auth guard על admin routes | `app/api/dev/admin/*` | כל אחד יכול לאשר/לדחות יזמים |
| JWT_SECRET defaulting | `lib/auth.ts` | ברירת מחדל "dev-secret-change-me" |
| `.env.local` עם API keys אמיתיים מחובר ל-git | `.env.local` | חשיפת secrets (Anthropic, ElevenLabs, HeyGen) |
| אין rate limiting | כל routes | DoS / brute force |
| אין CSRF protection | כל forms | CSRF attacks |
| אין input validation | רוב routes | injection risks |

### Mock / Stub Code

| קובץ | מה חסר |
|------|--------|
| `app/api/liveavatar/session/route.ts` | מחזיר placeholder credentials — LiveKit provisioning אמיתי לא ממומש |
| `prisma/schema.prisma` — role "seller" | תפקיד מוגדר בסכמה, אפס לוגיקה |
| `UnitType.quantityAvailable` | שדה קיים, לא מתעדכן בשום נקודה |

### כיסוי בדיקות (Tests)

| מה קיים | מה חסר |
|---------|--------|
| Unit tests ל-`lib/matching.ts`, `lib/ledger.ts`, `lib/elasticity.ts` | אין tests לאף API route |
| — | אין integration tests |
| — | אין component tests |
| — | Jest runner לא מוגדר ב-package.json (משתמשים ב-ts-node/tsx ישירות) |

### בעיות תשתית

| בעיה | פרטים |
|------|-------|
| SQLite בלבד | לא מתאים לפרודקשן multi-user; צריך PostgreSQL |
| `prisma.config.ts` בשורש (לא-סטנדרטי) | Prisma מסתמך על קובץ config לא-standard |
| `dev.db` מחובר ל-git | DB מסופח לריפו — לא נכון |
| אין observability | אין logging, error tracking, או monitoring |
| Seller role stub | `User.role="seller"` בסכמה ללא כל מימוש |

---

## 5. מה חסר להשקה — Next Steps לפי עדיפות

### 🔴 חובה לפני כל הדגמה מול גורם חיצוני

1. **Auth guard על `/dev/admin/*`** — כרגע כל אחד יכול לאשר יזמים
2. **הסרת `DEMO_SHOW_PROFILE = true`** ב-`app/results/page.tsx` — חושף נתוני קונה גולמיים
3. **הסרת timer ה-5 שניות** ב-`app/interview/page.tsx` — נראה אגלי ושבור
4. **הסרת PDF upload branch** ב-`app/processing/page.tsx`
5. **הוצאת secrets מה-git** — `.env.local` עם API keys אמיתיים חייב להיות ב-`.gitignore`

### 🟠 נדרש ל-MVP ראשוני

6. **LiveKit / ElevenLabs integration אמיתית** — כרגע הראיון מתנהג כ-demo timer; האווטאר לא עובד בפרודקשן ללא session provisioning אמיתי
7. **דף סטטוס הצעות לרוכש** — הרוכש לא יכול לראות מה קורה עם ההצעה שלו אחרי שלחה
8. **עדכון `quantityAvailable`** בקבלת הצעה — מנע double-booking
9. **JWT_SECRET** — ודא שמוגדר ב-env ולא fallback לstring קבוע
10. **Email notifications** — לפחות אחד מ: אישור הצעה / דחיית הצעה / counter offer

### 🟡 לפני MVP מסחרי

11. **flow רוכש לקבוצת רכישה** מתוך דף התוצאות (כרגע רק דרך `/buyer/leverage-groups` ישירות)
12. **Input validation** על כל API routes (Zod / כל ספרייה)
13. **Rate limiting** — לפחות על auth routes ו-Claude calls
14. **מעבר ל-PostgreSQL** עבור multi-user load
15. **CSRF protection** על forms
16. **Unit tests לאפי routes** — הלוגיקה העסקית הקריטית לא מכוסה

### ⚪ לטווח ארוך / מחוץ לסקופ כרגע

17. מימוש תפקיד seller (כרגע stub בסכמה בלבד)
18. סגירת עסקה — חוזה דיגיטלי, תשלום, escrow
19. KYC / זיהוי זהות לרוכשים
20. Dashboard אנליטיקס לאדמין
21. Real-time notifications (WebSocket / SSE)

---

*נוצר מסריקת קוד אוטומטית של כל קבצי הפרויקט — `app/`, `lib/`, `prisma/`, `scripts/`. כל הסימונים מבוססים על מה שנמצא בפועל בקוד.*
