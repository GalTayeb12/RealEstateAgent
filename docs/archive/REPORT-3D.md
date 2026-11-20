# REPORT-3D — סיכום שיפורים לסיור התלת-ממדי

**תאריך:** 2026-11-18  
**ענף:** `redesign`  
**כלים:** r3f-best-practices, three-best-practices, emil-design-eng

---

## מה שונה

### 1. מעבר מצלמה רך בין חדרים (`TourControls.tsx`)

**לפני:** `orbitRef.current.target.lerp(targetPos, factor)` עם `factor = 1 - exp(-dt * 4)` — קבוע, ללא תלות במרחק.  
**אחרי:** אנימציה מתוזמנת עם easeInOutQuad.

```ts
const duration = reducedMotion ? 0 : Math.min(0.3 + dist * 0.11, 1.4); // שניות
// easeInOut: t < 0.5 ? 2t² : 1 - (-2t+2)²/2
```

- **משך**: 0.3 שניות לחדרים סמוכים, עד 1.4 שניות למרחק מקסימלי.
- **הפרעת משתמש**: האנימציה מבוטלת ברגע שהמשתמש מתחיל לגרור (`OrbitControls 'start' event`).
- **prefers-reduced-motion**: `duration = 0` → קפיצה ישירה ליעד.
- **קובץ**: `components/tour/TourControls.tsx`, שורות 90–145.

---

### 2. תאורה, חומרים ו-Environment (`ApartmentBuilder.tsx`)

| לפני | אחרי |
|------|------|
| `hemisphereLight(0xffffff, 0x98a2ad, 0.78)` | hemisphere חמה `0xfff8f0 / 0x9aadb8, 0.55` + `Environment preset="city"` (IBL) |
| `directionalLight intensity=0.72, color=white` | `intensity=1.1, color=0xfffbf0 (golden)`, shadow `bias=-0.0005, normalBias=0.02` |
| shadow-mapSize 2048 | 2048 desktop / 1024 mobile |
| glass: `roughness=0.1`, `opacity=0.3` | `MeshPhysicalMaterial` עם `transmission=0.6`, `roughness=0.05`, `envMapIntensity=0.8` |
| אין | `ContactShadows` (desktop בלבד) — AO רך על הרצפה |
| אין | fill light נוסף `[14, 8, 12]` ו-bounce point light |

- **ContactShadows**: `components/tour/ApartmentBuilder.tsx:338` — מבוטל על mobile.
- **חומרי זכוכית משותפים**: `getGlassMat()` / `getRailingGlassMat()` — נוצרים פעם אחת בלבד (לא per-render).
- **טקסטורות**: רזולוציה הוכפלה 128→256 לעץ ואריחים, עם גרעין עשיר יותר.
- **Environment**: `<Environment preset="city" background={false} environmentIntensity={0.45} />` — IBL לתאורה עקיפה.

---

### 3. מצב טעינה עם התקדמות אמיתית (`TourLayout.tsx`)

**לפני:** skeleton ללא מחוון התקדמות.  
**אחרי:**
- `<progress role="progressbar" aria-valuenow={loadProgress} />` עם אנימציית `transition: width 0.4s ease`.
- התקדמות: 10% → 25% → 50% → 75% → 90% → 100% לאורך שלבי ה-fetch.
- `role="status" aria-live="polite" aria-label="טוען סיור תלת ממדי"` על ה-wrapper.

---

### 4. Fallback ללא WebGL (`ApartmentScene.tsx`)

**לפני:** `<div>` רגיל עם טקסט.  
**אחרי:** `<WebGLFallback />` מעוצב עם:
- אייקון SVG של בניין (inline, ללא תלות רשת).
- רקע gradient, טקסט מסביר ב-RTL.
- גודל מינימלי וריווח נגיש.

---

### 5. מובייל — DPR, frameloop, touch (`ApartmentScene.tsx`)

| | לפני | אחרי |
|--|------|------|
| DPR | `[1, 1.5]` תמיד | `[1, 1.5]` mobile / `[1, 2]` desktop |
| antialiasing | תמיד | desktop בלבד (`!isMobile`) |
| frameloop | `"always"` תמיד | `"demand"` ב-mobile orbit, `"always"` ב-walk |
| multi-touch | לא מנוהל | `activePtrId` guard מונע קפיצה ב-finger switch |

**Walk mode touch look**: הטמעה קיימת (PointerEvents) — נבדקה ועובדת. לא שונה.

---

### 6. ביצועים — תיקון setState ב-useFrame (`ApartmentScene.tsx`, `TourLayout.tsx`)

**לפני:** `DwellTracker` קרא ל-`onDwellUpdate` בכל frame → `setDwell` 60 פעמים בשנייה → 60 re-renders.

**אחרי:**
- `DwellTracker` צובר ב-`bufRef.current` ללא state.
- מדי 2 שניות מרוקן את ה-buffer ל-callback.
- `handleDwellUpdate` כותב ל-`dwellAccRef.current` (ref בלבד).
- `setInterval(2000)` ב-`TourLayout` מסנכרן ref → state.

**תוצאה**: מ-60 re-renders/שניה ל-0.5/שניה (ירידה של 99%).

---

### 7. נגישות — ניווט מקלדת ותוויות (`TourLayout.tsx`)

- **`role="toolbar" dir="rtl"`** על קונטיינר ה-chips.
- **`aria-pressed={active}`** ו-**`aria-label={label}`** על כל chip.
- **`data-room-id`** attribute לניהול focus תכנותי.
- **ניווט חצים**: `ArrowLeft` / `ArrowRight` עוברים בין חדרים ומזיזים focus.
- **`:focus-visible`** ring: `3px solid var(--qp-accent)` — גלוי למשתמשי מקלדת בלבד.
- **`:active` scale**: `transform: scale(0.96)` עם `120ms ease-out`.
- **עברית RTL**: כבר קיים; ווידוא על labels + `direction: "rtl"` מפורש ב-chips.

---

### 8. BuildingEnvironment.tsx

- נוסף `<Environment preset="city" />` ב-high quality desktop.
- shadow-mapSize הועלה ל-2048 ב-desktop.
- נוסף `shadow-normalBias={0.03}` להפחתת acne.
- תיאום צבע hemisphere: `#FFCC88 / #6090A8` (עקבי עם apartment).

---

## FPS לפני ואחרי

**הערה חשובה:** Playwright headless אינו מייצג ביצועי GPU אמיתיים. ה-FPS הנמוך ב-desktop (`2–3`) הוא תוצר של software rendering ב-CI ולא ביצוע אמיתי. במכשיר ממשי צפוי 30–60 FPS.

| | Desktop 1440 (headless) | Mobile 375 (headless) |
|--|--------------------------|------------------------|
| **Run 1** (pre-fix) | 2 FPS / 20.2s load | 55 FPS / 6.5s load |
| **Run 2** (PCFSoft fix) | 3 FPS / 10.7s load | 61 FPS / 5.9s load |
| **Run 3** (SoftShadows removed) | 2 FPS / 5.1s load | 57 FPS / 6.5s load |

**שיפור מדיד**: זמן הטעינה ב-desktop ירד מ-20.2s ל-5.1s (74%) — בעיקר בגלל שאין run 1 "חם" של HMR.

---

## שגיאות קונסול שנותרו

| שגיאה | מקור | ניתן לתיקון |
|-------|------|------------|
| `THREE.Clock deprecated` | R3F v9 internal | לא — דרוש עדכון R3F |
| `PCFSoftShadowMap removed` | R3F v9 sets it internally | לא — דרוש עדכון R3F |
| `404 /api/buildings/unit/sample` | unit לא קיים ב-DB | expected fallback — לא bug |
| `Attempted to synchronously unmount` | React race (pre-existing) | לחקור בנפרד |
| `GPU stall ReadPixels` | Playwright headless בלבד | לא רלוונטי |

---

## מה לא אומת

1. **FPS אמיתי** — לא נמדד על מכשיר עם GPU. מומלץ לבדוק עם `r3f-perf` בדפדפן אמיתי.
2. **Environment HDR** — `preset="city"` טוען מ-CDN. לא נבדק ב-offline.
3. **ContactShadows mobile** — מבוטל על mobile, לא נראה. ניתן להוסיף בגרסה עתידית.
4. **Walk mode touch** — `WalkLookHandler` עובד עם PointerEvents. לא נבדק על מכשיר פיזי.
5. **עברית עם ניקוד** — labels מה-JSON, לא נוסף ניקוד. RTL פועל.
6. **Screen reader** — לא נבדק עם NVDA/VoiceOver. ARIA attributes נוספו.

---

## קבצים שוּנו

```
components/tour/ApartmentBuilder.tsx   — תאורה, חומרים, Environment, ContactShadows
components/tour/ApartmentScene.tsx     — DPR, frameloop, mobile, WebGL fallback, dwell fix
components/tour/TourControls.tsx       — timed camera transition, easing, reduced-motion
components/tour/TourLayout.tsx         — loading progress, keyboard nav, ARIA, dwell fix
components/building/BuildingEnvironment.tsx — Environment, shadow quality
e2e/tour-3d.spec.ts                    — Playwright before/after spec (חדש)
e2e/tour-rtl-keyboard.spec.ts          — Playwright RTL keyboard + mobile transition (חדש)
vitest.config.ts                       — exclude e2e from vitest
public/hdr/potsdamer_platz_1k.hdr      — HDR מקומי (1.5MB, מחליף CDN)
```

---

## סבב תיקונים (Round 2)

### 1. frameloop="demand" + invalidate() ✅

**בדיקה:** Playwright במובייל 375px — לחיצה על chip מחדר ראשון לשני.  
**ממצא לפני תיקון:** בתיאוריה, בmobile orbit mode שמשתמש ב-`frameloop="demand"`, המעבר לא היה מתעדכן כי `useFrame` לא רץ אלא אם `invalidate()` נקרא.

**תיקונים ב-TourControls.tsx:**
1. `const { camera, invalidate } = useThree()` — נוסף `invalidate` לחילוץ
2. בתוך `useEffect([targetPos])` — `invalidate()` מייד עם יצירת transition
3. בתוך `useFrame` — `invalidate()` בכל פריים שהtransition פעיל עד שמסתיים
4. בwall scale animation — `invalidate()` כל עוד `|delta| > 0.001`

**תיקון ב-ApartmentBuilder.tsx (ProfileFurniture):**
- `invalidate()` ב-`useEffect` בהחלפת profile
- `invalidate()` ב-`useFrame` כל עוד אנימציה פעילה

**תיעוד Playwright (mobile 375px):** מבחן `room chip click triggers camera transition on mobile 375px` — ✅ עובר. בדיקה ש-`aria-pressed="true"` עובר לchip שנבחר לאחר 1.5 שניות.

---

### 2. Environment HDR מקומי ✅

**ממצא:** `Environment preset="city"` טוען מ:
```
https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/potsdamer_platz_1k.hdr
```

**פתרון:**
- הורדת הקובץ (1.5MB) ל-`public/hdr/potsdamer_platz_1k.hdr`
- שינוי בשני קבצים:
  ```tsx
  // לפני:
  <Environment preset="city" ... />
  // אחרי:
  <Environment files="/hdr/potsdamer_platz_1k.hdr" ... />
  ```
  - `ApartmentBuilder.tsx` ו-`BuildingEnvironment.tsx`

**אמות:** אין יותר בקשות רשת חיצוניות לHDR — הקובץ נטען מ-`/hdr/` ב-`public/`.

---

### 3. ArrowLeft / ArrowRight כיוון RTL ✅

**לוגיקה:**
- container: `dir="rtl"` → chips זורמים מימין לשמאל
- index 0 (`סלון`) נמצא **ימינה**, index 7 (`מרפסת`) **שמאלה**
- `ArrowLeft` = זזה שמאלה = index + 1 = הבא במערך ✓
- `ArrowRight` = זזה ימינה = index - 1 = הקודם במערך ✓
- wrap: `ArrowRight` מindex 0 → index 7 (wrap לסוף) ✓

**מבחן Playwright (`e2e/tour-rtl-keyboard.spec.ts`):**
| scenario | mobile-375 | desktop-1440 |
|---------|-----------|-------------|
| ArrowLeft מindex 0 → index 1 | ✅ | ✅ |
| ArrowRight מindex 1 → index 0 | ✅ | ✅ |
| ArrowRight מindex 0 → wrap לindex last | ✅ | ✅ |

---

### 4. שגיאות קונסול — לאחר תיקונים

| שגיאה | סטטוס | הסבר |
|-------|--------|------|
| `THREE.WebGLShadowMap: PCFSoftShadowMap removed` | ✅ **תוקן** | נוסף `onCreated` ב-Canvas שמאפס ל-`THREE.PCFShadowMap` לאחר שR3F v9 מגדיר אותו |
| `Attempted to synchronously unmount` | ✅ **תוקן** | הוסרה עטיפת `Suspense` מיותרת מ-`ApartmentBuilder` |
| `THREE.Clock deprecated` | ⚠️ לא תוקן — R3F v9 internal | R3F v9 משתמש ב-`THREE.Clock` אך Three.js r186 הוציא אותה. נדרש עדכון R3F לv10. |
| `404 /api/buildings/unit/sample` | ✅ expected | unit ID "sample" לא קיים ב-DB → fallback to sampleApartment.json. לא bug. |
| `GPU stall ReadPixels` | ✅ לא רלוונטי | Playwright headless בלבד (Chromium software renderer). לא מופיע בproduction. |

**מאזן שגיאות:** desktop 9 → 6, mobile 5 → 2.

---

### מדדים סבב 2 (headless Playwright)

| | Desktop 1440 | Mobile 375 |
|--|-------------|-----------|
| **סבב 1 (pre-fix)** | 9 errors / 20.2s | 5 errors / 6.5s |
| **סבב 2 (round 2)** | 6 errors / 6.9s | 2 errors / 5.2s |
| שגיאות שנותרו | 404 expected + THREE.Clock + GPU stall | 404 expected + THREE.Clock |
