/**
 * GET /api/deal/[offerId]/pdf
 *
 * Generates and streams a "Deal Summary" PDF for the accepted offer.
 * Uses pdf-lib for server-side PDF generation.
 *
 * Access rules: same as Deal Room — buyer or developer on an accepted offer.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractToken } from "@/lib/auth";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

    // ── Generate PDF ──────────────────────────────────────────────────────────

    const doc = await PDFDocument.create();
    const page = doc.addPage([595.28, 841.89]); // A4 portrait
    const { width, height } = page.getSize();

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const teal = rgb(0.122, 0.294, 0.290);   // #1F4B4A
    const gold = rgb(0.784, 0.608, 0.235);   // #C89B3C
    const dark = rgb(0.110, 0.106, 0.098);   // #1C1B19
    const muted = rgb(0.420, 0.408, 0.376);  // #6B6860
    const light = rgb(0.867, 0.851, 0.831);  // #DDD9D3

    const margin = 60;
    const contentW = width - margin * 2;

    function drawText(
      text: string,
      x: number,
      y: number,
      opts: { font?: typeof font; size?: number; color?: ReturnType<typeof rgb> } = {}
    ) {
      page.drawText(text, {
        x,
        y,
        font: opts.font ?? font,
        size: opts.size ?? 11,
        color: opts.color ?? dark,
      });
    }

    function drawLine(y: number, color = light) {
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 0.75,
        color,
      });
    }

    const finalPrice = offer.counterPrice ?? offer.offeredPrice;
    const companyName =
      offer.developer.developerProfile?.companyName ?? offer.developer.email;
    const dateAccepted = new Date(offer.updatedAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const generatedAt = new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    let y = height - margin;

    // Platform label
    drawText("Haveniq", margin, y, { font: bold, size: 9, color: teal });
    y -= 28;

    // Title
    drawText("Deal Summary", margin, y, { font: bold, size: 26, color: dark });
    y -= 14;

    drawText("Property Reserved — Subject to Contract", margin, y, {
      size: 11,
      color: muted,
    });
    y -= 20;

    drawLine(y, gold);
    y -= 24;

    // ── Property section ──────────────────────────────────────────────────────

    drawText("PROPERTY", margin, y, { font: bold, size: 9, color: teal });
    y -= 18;

    const rows: [string, string][] = [
      ["Unit type", offer.unitType.unitLabel],
      ["Project", offer.unitType.project.name],
      ["Location", offer.unitType.project.location || "—"],
    ];

    for (const [label, value] of rows) {
      drawText(label, margin, y, { size: 10, color: muted });
      drawText(value, margin + 110, y, { font: bold, size: 10 });
      y -= 18;
    }

    y -= 12;
    drawLine(y);
    y -= 24;

    // ── Deal details section ──────────────────────────────────────────────────

    drawText("DEAL DETAILS", margin, y, { font: bold, size: 9, color: teal });
    y -= 18;

    const details: [string, string][] = [
      ["Buyer", offer.buyer.email],
      ["Developer", companyName],
      ["Final agreed price", `£${finalPrice.toLocaleString("en-GB")}`],
      ["Date agreed", dateAccepted],
      ["Offer reference", offer.id],
    ];

    for (const [label, value] of details) {
      drawText(label, margin, y, { size: 10, color: muted });
      const isPrice = label === "Final agreed price";
      drawText(value, margin + 140, y, {
        font: isPrice ? bold : font,
        size: isPrice ? 12 : 10,
        color: isPrice ? teal : dark,
      });
      y -= 18;
    }

    if (offer.ledgerBlockHash) {
      y -= 4;
      drawText("Ledger reference", margin, y, { size: 10, color: muted });
      drawText(offer.ledgerBlockHash.slice(0, 20) + "…", margin + 140, y, {
        size: 9,
        color: muted,
      });
      y -= 18;
    }

    y -= 16;
    drawLine(y);
    y -= 32;

    // ── Disclaimer ────────────────────────────────────────────────────────────

    const disclaimerLines = [
      "This document confirms that the above property has been reserved subject",
      "to contract. This is not a legally binding contract. No money has been",
      "collected by this platform. Please instruct a solicitor to proceed.",
    ];
    for (const line of disclaimerLines) {
      drawText(line, margin, y, { size: 9, color: muted });
      y -= 14;
    }

    y -= 20;
    drawLine(y, light);
    y -= 16;

    // Footer
    drawText(
      `Generated by Haveniq · ${generatedAt}`,
      margin,
      y,
      { size: 8, color: muted }
    );

    const pdfBytes = await doc.save();
    const buffer = Buffer.from(pdfBytes);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="deal-summary-${offerId.slice(0, 8)}.pdf"`,
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/deal/pdf] error:", msg);
    return NextResponse.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}
