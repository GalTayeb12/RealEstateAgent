/**
 * GET /api/deal/[offerId]/pdf
 *
 * Generates and streams a "Deal Summary" PDF for the accepted offer.
 * Hebrew locale: embeds Heebo TTF with RTL text positioning.
 * Brand colours: teal #123F40, gold #C89B3C, ivory #F5F0E8.
 *
 * Access rules: same as Deal Room — buyer or developer on an accepted offer.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require("@pdf-lib/fontkit") as { default?: unknown } & unknown;
const fontkitDefault = (fontkit as { default?: unknown }).default ?? fontkit;
import { readFile } from "fs/promises";
import path from "path";
import { formatMoneyPlain } from "@/lib/i18n/currency";
import { parseLocale } from "@/lib/i18n/locale";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offerId: string }> }
) {
  try {
    const { offerId } = await params;
    const auth = extractToken(req.headers.get("Authorization"));
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const viewer = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { locale: true },
    });
    const viewerLocale = parseLocale(viewer?.locale);
    const isHebrew = viewerLocale === "he";

    const offer = await prisma.offer.findUnique({
      where: { id: offerId },
      include: {
        buyer: { select: { email: true } },
        developer: {
          select: {
            email: true,
            developerProfile: { select: { companyName: true } },
          },
        },
        unitType: {
          select: {
            unitLabel: true,
            price: true,
            project: { select: { name: true, location: true } },
          },
        },
      },
    });

    if (!offer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (auth.userId !== offer.buyerId && auth.userId !== offer.developerId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (offer.status !== "accepted") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── Build PDF ─────────────────────────────────────────────────────────────

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4 portrait
    const { width, height } = page.getSize();

    // Brand colours
    const teal   = rgb(0.071, 0.247, 0.251);  // #123F40
    const gold   = rgb(0.784, 0.608, 0.235);  // #C89B3C
    const ivory  = rgb(0.961, 0.941, 0.910);  // #F5F0E8
    const dark   = rgb(0.110, 0.106, 0.098);  // #1C1B19
    const muted  = rgb(0.420, 0.408, 0.376);  // #6B6860
    const border = rgb(0.867, 0.851, 0.831);  // #DDD9D3

    const margin  = 60;
    const headerH = 84;
    const footerH = 32;

    // ── Fonts ─────────────────────────────────────────────────────────────────
    let font: Awaited<ReturnType<typeof doc.embedFont>>;
    let bold: Awaited<ReturnType<typeof doc.embedFont>>;

    if (isHebrew) {
      doc.registerFontkit(fontkitDefault as Parameters<typeof doc.registerFontkit>[0]);
      const fontsDir = path.join(process.cwd(), "public", "fonts");
      const [regBytes, boldBytes] = await Promise.all([
        readFile(path.join(fontsDir, "Heebo-Regular.ttf")),
        readFile(path.join(fontsDir, "Heebo-Bold.ttf")),
      ]);
      font = await doc.embedFont(regBytes);
      bold = await doc.embedFont(boldBytes);
    } else {
      font = await doc.embedFont(StandardFonts.Helvetica);
      bold = await doc.embedFont(StandardFonts.HelveticaBold);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Draw text, right-aligned from x for Hebrew, left-aligned for English. */
    function drawText(
      text: string,
      x: number,
      y: number,
      opts: {
        font?: typeof font;
        size?: number;
        color?: ReturnType<typeof rgb>;
        rtl?: boolean;
      } = {}
    ) {
      const f    = opts.font  ?? font;
      const sz   = opts.size  ?? 11;
      const col  = opts.color ?? dark;
      const rtl  = opts.rtl  ?? isHebrew;

      const drawX = rtl ? x - f.widthOfTextAtSize(text, sz) : x;
      page.drawText(text, { x: drawX, y, font: f, size: sz, color: col });
    }

    /** Draw a full-width horizontal line. */
    function drawLine(
      y: number,
      color = border,
      thickness = 0.75
    ) {
      page.drawLine({
        start: { x: margin, y },
        end:   { x: width - margin, y },
        thickness,
        color,
      });
    }

    // Label / value positions: for RTL, labels are right-aligned from the right margin
    // and values are right-aligned slightly further left.
    const labelX = isHebrew ? width - margin       : margin + 4;
    const valueX = isHebrew ? width - margin - 130 : margin + 150;

    function drawRow(
      label: string,
      value: string,
      y: number,
      opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}
    ) {
      const valueFnt  = opts.bold ? bold : font;
      const valueSize = opts.size ?? 10;
      const valueCol  = opts.color ?? dark;
      drawText(label, labelX, y, { size: 10, color: muted, rtl: isHebrew });
      drawText(value, valueX, y, { font: valueFnt, size: valueSize, color: valueCol, rtl: isHebrew });
    }

    // ── Localised strings ─────────────────────────────────────────────────────
    const HE = {
      title:       "סיכום עסקה",
      subtitle:    "הנכס הוזמן — בכפוף לחוזה",
      property:    "פרטי הנכס",
      unitType:    "סוג יחידה",
      project:     "פרויקט",
      location:    "מיקום",
      deal:        "פרטי העסקה",
      buyer:       "קונה",
      developer:   "יזם",
      price:       "מחיר סופי מוסכם",
      date:        "תאריך אישור",
      ref:         "מספר עסקה",
      ledger:      "אסמכתא פנקס",
      disclaimer1: "מסמך זה מאשר כי הנכס האמור הוזמן בכפוף לחוזה.",
      disclaimer2: "זהו אינו חוזה מחייב מבחינה משפטית. לא נגבה כסף על ידי הפלטפורמה.",
      disclaimer3: "אנא פנו לעורך דין להמשך הליכים.",
      footer:      "הופק על ידי Haveniq",
    };
    const EN = {
      title:       "Deal Summary",
      subtitle:    "Property Reserved \u2014 Subject to Contract",
      property:    "PROPERTY",
      unitType:    "Unit type",
      project:     "Project",
      location:    "Location",
      deal:        "DEAL DETAILS",
      buyer:       "Buyer",
      developer:   "Developer",
      price:       "Final agreed price",
      date:        "Date agreed",
      ref:         "Reference",
      ledger:      "Ledger reference",
      disclaimer1: "This document confirms that the above property has been reserved subject",
      disclaimer2: "to contract. This is not a legally binding contract. No money has been",
      disclaimer3: "collected by this platform. Please instruct a solicitor to proceed.",
      footer:      "Generated by Haveniq",
    };
    const L = isHebrew ? HE : EN;

    const finalPrice  = offer.counterPrice ?? offer.offeredPrice;
    const companyName = offer.developer.developerProfile?.companyName ?? offer.developer.email;
    const dateLocale  = isHebrew ? "he-IL" : "en-GB";
    const dateOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
    const dateAccepted = new Date(offer.updatedAt).toLocaleDateString(dateLocale, dateOpts);
    const generatedAt  = new Date().toLocaleDateString(dateLocale, dateOpts);

    // ── Header band (ivory) ───────────────────────────────────────────────────

    page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: ivory });

    // "Haveniq" label — always LTR, top-left of ivory band
    page.drawText("Haveniq", {
      x: margin, y: height - 26,
      font: bold, size: 9, color: teal,
    });

    // Page number top-right
    const pgLabel = "1";
    const pgW = bold.widthOfTextAtSize(pgLabel, 9);
    page.drawText(pgLabel, {
      x: width - margin - pgW, y: height - 26,
      font: bold, size: 9, color: muted,
    });

    // Title
    const titleX = isHebrew ? width - margin : margin;
    drawText(L.title, titleX, height - 50, { font: bold, size: 24, color: dark });

    // Date (opposite corner)
    const dateW = font.widthOfTextAtSize(dateAccepted, 10);
    const dateDrawX = isHebrew ? margin : width - margin - dateW;
    page.drawText(dateAccepted, { x: dateDrawX, y: height - 50, font, size: 10, color: muted });

    drawText(L.subtitle, titleX, height - 70, { size: 11, color: muted });

    let y = height - headerH - 24;

    drawLine(y, gold, 1.5);
    y -= 24;

    // ── Property section ──────────────────────────────────────────────────────

    const secX = isHebrew ? width - margin : margin;
    drawText(L.property, secX, y, { font: bold, size: 8, color: teal });
    y -= 20;

    const propertyRows: [string, string][] = [
      [L.unitType, offer.unitType.unitLabel],
      [L.project,  offer.unitType.project.name],
      [L.location, offer.unitType.project.location || "\u2014"],
    ];

    for (const [label, value] of propertyRows) {
      page.drawRectangle({ x: margin, y: y - 4, width: width - margin * 2, height: 18, color: ivory, opacity: 0.5 });
      drawRow(label, value, y);
      y -= 18;
    }

    y -= 14;
    drawLine(y, border);
    y -= 24;

    // ── Deal details section ──────────────────────────────────────────────────

    drawText(L.deal, secX, y, { font: bold, size: 8, color: teal });
    y -= 20;

    const dealRows: [string, string, boolean][] = [
      [L.buyer,     offer.buyer.email,                       false],
      [L.developer, companyName,                             false],
      [L.price,     formatMoneyPlain(finalPrice, viewerLocale), true],
      [L.date,      dateAccepted,                            false],
      [L.ref,       offer.id.slice(0, 20),                   false],
    ];

    for (const [label, value, isPrice] of dealRows) {
      if (isPrice) {
        page.drawRectangle({ x: margin, y: y - 4, width: width - margin * 2, height: 20, color: ivory });
      }
      drawRow(label, value, y, {
        bold: isPrice,
        size: isPrice ? 13 : 10,
        color: isPrice ? teal : dark,
      });
      y -= isPrice ? 22 : 18;
    }

    if (offer.ledgerBlockHash) {
      drawRow(L.ledger, offer.ledgerBlockHash.slice(0, 20) + "\u2026", y, { size: 9, color: muted });
      y -= 18;
    }

    y -= 16;
    drawLine(y, border);
    y -= 28;

    // ── Disclaimer ────────────────────────────────────────────────────────────

    for (const line of [L.disclaimer1, L.disclaimer2, L.disclaimer3]) {
      drawText(line, isHebrew ? width - margin : margin, y, { size: 9, color: muted });
      y -= 14;
    }

    // ── Footer band (ivory) ───────────────────────────────────────────────────

    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: ivory });
    page.drawLine({ start: { x: 0, y: footerH }, end: { x: width, y: footerH }, thickness: 1, color: teal });

    const footerText = `${L.footer} \u00B7 ${generatedAt}`;
    const footerX = isHebrew ? width - margin : margin;
    drawText(footerText, footerX, 10, { size: 8, color: muted });

    // ── Stream response ───────────────────────────────────────────────────────

    const pdfBytes = await doc.save();
    const buffer   = Buffer.from(pdfBytes);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="deal-summary-${offerId.slice(0, 8)}.pdf"`,
        "Content-Length":      String(buffer.byteLength),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/deal/pdf] error:", msg);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
