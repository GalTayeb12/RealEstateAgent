"use client";
/**
 * MortgageCalculator — full card and mini variant.
 *
 * Usage:
 *   <MortgageCalculator />           ← full card (results page)
 *   <MortgageCalculator mini price={1800000} />  ← compact (AOM page)
 *
 * Props:
 *   mini    — compact layout, pre-filled price, no "show in range" button
 *   price   — pre-fill the property price field
 *   buyerBudgetMax — when provided, the "show only in-range" toggle is active
 *   onFilterChange — callback(inRangeOnly: boolean) for results page filter
 */

import { useState, useMemo } from "react";
import { useI18n } from "@/components/LocaleProvider";
import {
  computeSpitzer,
  checkLtv,
  evaluateDti,
  computeReverse,
} from "@/lib/mortgage/calculator";
import type { BuyerType } from "@/lib/mortgage/config";
import { MAX_TERM_YEARS, WARN_TERM_YEARS } from "@/lib/mortgage/config";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtILS(n: number): string {
  return new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

// ── Shared result table ───────────────────────────────────────────────────────

interface ResultTableProps {
  rows: { label: string; value: string; gold?: boolean }[];
}

function ResultTable({ rows }: ResultTableProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {rows.map(({ label, value, gold }) => (
        <div
          key={label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "1rem",
            padding: "0.4375rem 0",
            borderBottom: "1px solid rgba(18,63,64,0.05)",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "#526563" }}>{label}</span>
          <span
            style={{
              fontFamily: "var(--font-heebo, sans-serif)",
              fontSize: gold ? "1.125rem" : "0.9375rem",
              fontWeight: gold ? 600 : 500,
              color: gold ? "#756039" : "#123F40",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Slider + number input row ─────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
  inputSuffix?: string;
}

function SliderRow({ label, value, min, max, step, onChange, formatValue, inputSuffix }: SliderRowProps) {
  const display = formatValue ? formatValue(value) : String(value);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3125rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C" }}>
          {label}
        </label>
        <span style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "0.9375rem", fontWeight: 600, color: "#123F40", fontVariantNumeric: "tabular-nums" }}>
          {display}{inputSuffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#123F40", cursor: "pointer" }}
      />
    </div>
  );
}

// ── DTI badge ─────────────────────────────────────────────────────────────────

function DtiBadge({ ratio, color, label }: { ratio: number; color: string; label: string }) {
  const bg = color === "green" ? "#E9EEEA" : color === "yellow" ? "#FFF8E6" : "#FBECEA";
  const fg = color === "green" ? "#246046" : color === "yellow" ? "#756039" : "#9E3434";
  return (
    <span style={{ background: bg, color: fg, borderRadius: 8, padding: "0.1875rem 0.625rem", fontSize: "0.8125rem", fontWeight: 600 }}>
      {pct(ratio)} · {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MortgageCalculatorProps {
  mini?: boolean;
  price?: number;
  /** Called when the in-range filter toggled. Receives (active, maxAffordablePrice). */
  onFilterChange?: (inRangeOnly: boolean, maxPrice: number) => void;
  /** Buyer's budget from characterization — used to initialize price in full mode */
  initialBudget?: number | null;
}

export function MortgageCalculator({
  mini = false,
  price: prefillPrice,
  onFilterChange,
  initialBudget,
}: MortgageCalculatorProps) {
  const { m, locale } = useI18n();
  const mm = m.mortgage;

  // ── State ──
  const [mode, setMode] = useState<"forward" | "reverse">("forward");
  const [price, setPrice] = useState<number>(prefillPrice ?? initialBudget ?? 2_000_000);
  const [equity, setEquity] = useState<number>(500_000);
  const [buyerType, setBuyerType] = useState<BuyerType>("first");
  const [termYears, setTermYears] = useState<number>(25);
  const [annualRate, setAnnualRate] = useState<string>("");
  const [income, setIncome] = useState<string>("");
  const [filterActive, setFilterActive] = useState(false);

  // Reverse mode
  const [desiredPayment, setDesiredPayment] = useState<string>("");

  const rateNum = parseFloat(annualRate);
  const incomeNum = parseFloat(income) || null;
  const hasRate = !isNaN(rateNum) && rateNum > 0;

  // ── Calculations ──
  const forward = useMemo(() => {
    if (!hasRate) return null;
    return computeSpitzer({ price, equity, annualRatePercent: rateNum, termYears });
  }, [price, equity, rateNum, termYears, hasRate]);

  const ltvCheck = useMemo(() => checkLtv(price, equity, buyerType), [price, equity, buyerType]);

  const dti = useMemo(() => {
    if (!forward) return null;
    return evaluateDti(forward.monthlyPayment, incomeNum);
  }, [forward, incomeNum]);

  const reverse = useMemo(() => {
    const pmt = parseFloat(desiredPayment);
    if (isNaN(pmt) || pmt <= 0 || !hasRate) return null;
    return computeReverse({ equity, desiredMonthlyPayment: pmt, annualRatePercent: rateNum, termYears, buyerType });
  }, [equity, desiredPayment, rateNum, termYears, buyerType, hasRate]);

  // ── Formatting ──
  function fmtPrice(n: number) { return "₪" + fmtILS(n); }

  const isRtl = locale === "he";
  const dir = isRtl ? "rtl" : "ltr";

  if (mini) {
    return (
      <div dir={dir} style={{ background: "var(--qp-surface)", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.04)", overflow: "hidden", marginTop: "1.25rem" }}>
        <div style={{ height: 4, background: "linear-gradient(90deg, #756039, #A88B52)" }} />
        <div style={{ padding: "1.5rem 1.75rem" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#756039", marginBottom: "1rem" }}>
            {mm.miniTitle}
          </div>

          {/* Rate input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.4rem" }}>
                {mm.rate}
              </label>
              <input
                type="number"
                min={0.1} max={20} step={0.1}
                value={annualRate}
                onChange={e => setAnnualRate(e.target.value)}
                placeholder={mm.ratePh}
                style={{ background: "#fff", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.5rem 0.75rem", fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-heebo, monospace)", outline: "none", width: "8rem", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "#756039"; e.target.style.boxShadow = "0 0 0 3px rgba(117,96,57,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            <SliderRow
              label={mm.equity}
              value={equity}
              min={100_000}
              max={Math.min(price, 5_000_000)}
              step={50_000}
              onChange={setEquity}
              formatValue={fmtPrice}
            />

            <SliderRow
              label={mm.term}
              value={termYears}
              min={5}
              max={MAX_TERM_YEARS}
              step={1}
              onChange={setTermYears}
              inputSuffix={isRtl ? " שנה" : " yr"}
            />
          </div>

          {/* Results */}
          {!hasRate && (
            <p style={{ margin: "1rem 0 0", fontSize: "0.875rem", color: "#756039" }}>{mm.enterRate}</p>
          )}

          {hasRate && forward && (
            <div style={{ marginTop: "1.125rem" }}>
              {ltvCheck.status === "insufficient_equity" && (
                <div style={{ background: "#FBECEA", borderRadius: 10, padding: "0.625rem 0.875rem", fontSize: "0.8125rem", color: "#9E3434", fontWeight: 500, marginBottom: "0.875rem" }}>
                  {mm.ltvWarning.replace("{amount}", fmtILS(ltvCheck.shortfall))}
                </div>
              )}
              <ResultTable rows={[
                { label: mm.monthlyPayment, value: "₪" + fmtILS(forward.monthlyPayment), gold: true },
                { label: mm.loanAmount, value: "₪" + fmtILS(forward.loanAmount) },
                { label: mm.ltv, value: pct(forward.ltv) },
              ]} />
            </div>
          )}

          <p style={{ margin: "1rem 0 0", fontSize: "0.6875rem", color: "#7A8B82", lineHeight: 1.5 }}>{mm.disclaimer}</p>
        </div>
      </div>
    );
  }

  // ── Full card ──
  return (
    <div dir={dir} style={{ background: "#fff", borderRadius: 20, border: "1px solid rgba(18,63,64,0.08)", boxShadow: "0 2px 4px rgba(18,63,64,0.03), 0 16px 36px -16px rgba(18,51,50,0.10)", overflow: "hidden" }}>
      <div style={{ height: 4, background: "linear-gradient(90deg, #756039, #A88B52)" }} />
      <div style={{ padding: "1.75rem" }}>
        {/* Header + mode toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#756039", marginBottom: "0.3rem" }}>
              {mm.kicker}
            </div>
            <h2 style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.25rem", fontWeight: 500, color: "#123F40", margin: 0, lineHeight: 1.2 }}>
              {mm.title}
            </h2>
          </div>
          <div style={{ display: "flex", borderRadius: 999, border: "1px solid rgba(18,63,64,0.14)", overflow: "hidden" }}>
            {(["forward", "reverse"] as const).map(m_ => (
              <button
                key={m_}
                onClick={() => setMode(m_)}
                style={{
                  padding: "0.4rem 1rem",
                  background: mode === m_ ? "#123F40" : "transparent",
                  color: mode === m_ ? "#fff" : "#526563",
                  border: "none", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {m_ === "forward" ? mm.title : mm.reverseTitle.split("—")[0]?.trim()}
              </button>
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start" }} className="hn-mortgage-grid">
          <style>{`.hn-mortgage-grid { } @media (max-width: 640px) { .hn-mortgage-grid { grid-template-columns: 1fr !important; gap: 1.25rem !important; } }`}</style>

          {/* ── Left: inputs ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.125rem" }}>

            {mode === "forward" ? (
              <>
                <SliderRow
                  label={mm.price}
                  value={price}
                  min={500_000}
                  max={10_000_000}
                  step={50_000}
                  onChange={setPrice}
                  formatValue={fmtPrice}
                />
                <SliderRow
                  label={mm.equity}
                  value={equity}
                  min={100_000}
                  max={price}
                  step={50_000}
                  onChange={v => setEquity(Math.min(v, price))}
                  formatValue={fmtPrice}
                />
              </>
            ) : (
              <>
                <SliderRow
                  label={mm.equity}
                  value={equity}
                  min={100_000}
                  max={5_000_000}
                  step={50_000}
                  onChange={setEquity}
                  formatValue={fmtPrice}
                />
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.4rem" }}>
                    {mm.reverseDesiredPayment}
                  </label>
                  <input
                    type="number"
                    min={1000} step={500}
                    value={desiredPayment}
                    onChange={e => setDesiredPayment(e.target.value)}
                    placeholder={mm.reverseDesiredPaymentPh}
                    style={{ background: "#fff", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.5rem 0.75rem", fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-heebo, monospace)", outline: "none", width: "100%", boxSizing: "border-box" }}
                    onFocus={e => { e.target.style.borderColor = "#756039"; e.target.style.boxShadow = "0 0 0 3px rgba(117,96,57,0.12)"; }}
                    onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
              </>
            )}

            {/* Rate */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.4rem" }}>
                {mm.rate}
              </label>
              <input
                type="number"
                min={0.1} max={20} step={0.1}
                value={annualRate}
                onChange={e => setAnnualRate(e.target.value)}
                placeholder={mm.ratePh}
                style={{ background: "#fff", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.5rem 0.75rem", fontSize: "1rem", fontWeight: 600, fontFamily: "var(--font-heebo, monospace)", outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "#756039"; e.target.style.boxShadow = "0 0 0 3px rgba(117,96,57,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Term */}
            <SliderRow
              label={mm.term}
              value={termYears}
              min={5}
              max={MAX_TERM_YEARS}
              step={1}
              onChange={setTermYears}
              inputSuffix={isRtl ? " שנה" : " yr"}
            />
            {termYears > WARN_TERM_YEARS && (
              <p style={{ margin: 0, fontSize: "0.75rem", color: "#756039" }}>{mm.termWarning}</p>
            )}

            {/* Buyer type */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.4rem" }}>
                {mm.buyerType}
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {(["first", "moveUp", "investor"] as BuyerType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setBuyerType(t)}
                    style={{
                      padding: "0.3125rem 0.875rem",
                      borderRadius: 999,
                      border: "1px solid",
                      borderColor: buyerType === t ? "#123F40" : "#E0DDD7",
                      background: buyerType === t ? "#123F40" : "transparent",
                      color: buyerType === t ? "#fff" : "#526563",
                      fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {t === "first" ? mm.buyerTypeFirst : t === "moveUp" ? mm.buyerTypeMoveUp : mm.buyerTypeInvestor}
                  </button>
                ))}
              </div>
            </div>

            {/* Income (optional) */}
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#55534C", marginBottom: "0.4rem" }}>
                {mm.income}
              </label>
              <input
                type="number"
                min={1000} step={500}
                value={income}
                onChange={e => setIncome(e.target.value)}
                placeholder={mm.incomePh}
                style={{ background: "#fff", border: "1.5px solid #E0DDD7", borderRadius: 10, padding: "0.5rem 0.75rem", fontSize: "1rem", fontFamily: "var(--font-heebo, monospace)", fontWeight: 500, outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = "#123F40"; e.target.style.boxShadow = "0 0 0 3px rgba(31,75,74,0.12)"; }}
                onBlur={e => { e.target.style.borderColor = "#E0DDD7"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* ── Right: results ── */}
          <div>
            {!hasRate && (
              <div style={{ background: "#F5F3EE", borderRadius: 14, padding: "1.5rem", textAlign: "center" }}>
                <div style={{ fontSize: "0.9375rem", color: "#756039", fontWeight: 500 }}>{mm.enterRate}</div>
              </div>
            )}

            {hasRate && mode === "forward" && forward && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {/* LTV warning */}
                {ltvCheck.status === "insufficient_equity" && (
                  <div style={{ background: "#FBECEA", borderRadius: 12, padding: "0.75rem 1rem", display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9E3434" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <span style={{ fontSize: "0.8125rem", color: "#9E3434", fontWeight: 500, lineHeight: 1.5 }}>
                      {mm.ltvWarning.replace("{amount}", fmtILS(ltvCheck.shortfall))}
                    </span>
                  </div>
                )}

                {/* Main results */}
                <div style={{ background: "#F5F3EE", borderRadius: 14, padding: "1.25rem" }}>
                  <ResultTable rows={[
                    { label: mm.monthlyPayment, value: "₪" + fmtILS(forward.monthlyPayment), gold: true },
                    { label: mm.loanAmount, value: "₪" + fmtILS(forward.loanAmount) },
                    { label: mm.totalPayments, value: "₪" + fmtILS(forward.totalPayments) },
                    { label: mm.totalInterest, value: "₪" + fmtILS(forward.totalInterest) },
                    { label: mm.ltv, value: pct(forward.ltv) + " (max " + pct(ltvCheck.maxLtv) + ")" },
                  ]} />
                </div>

                {/* DTI */}
                {dti && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.8125rem", color: "#526563" }}>{mm.dtiLabel}:</span>
                    <DtiBadge
                      ratio={dti.ratio}
                      color={dti.color}
                      label={dti.color === "green" ? mm.dtiGreen : dti.color === "yellow" ? mm.dtiYellow : mm.dtiRed}
                    />
                  </div>
                )}

                {/* Filter button */}
                {onFilterChange && (
                  <button
                    onClick={() => {
                      const next = !filterActive;
                      setFilterActive(next);
                      onFilterChange(next, price);
                    }}
                    style={{
                      padding: "0.5rem 1.125rem",
                      borderRadius: 999,
                      border: "1.5px solid",
                      borderColor: filterActive ? "#756039" : "#E0DDD7",
                      background: filterActive ? "#FFF8E6" : "transparent",
                      color: filterActive ? "#756039" : "#526563",
                      fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "0.4rem",
                      transition: "all 0.15s",
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                    </svg>
                    {filterActive ? mm.hideInRange : mm.showInRange}
                  </button>
                )}
              </div>
            )}

            {hasRate && mode === "reverse" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                {reverse ? (
                  <div style={{ background: "#F5F3EE", borderRadius: 14, padding: "1.25rem" }}>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#756039", marginBottom: "0.75rem" }}>
                      {mm.reverseResult}
                    </div>
                    <div style={{ fontFamily: "var(--font-heebo, sans-serif)", fontSize: "1.5rem", fontWeight: 600, color: "#756039", marginBottom: "1rem", fontVariantNumeric: "tabular-nums" }}>
                      ₪{fmtILS(reverse.maxPrice)}
                    </div>
                    <ResultTable rows={[
                      { label: mm.loanAmount, value: "₪" + fmtILS(reverse.maxLoan) },
                      { label: mm.ltv, value: pct(reverse.maxLoan / reverse.maxPrice) + " (max " + pct(ltvCheck.maxLtv) + ")" },
                    ]} />
                    {reverse.ltvConstrained && (
                      <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "#9E3434" }}>{mm.reverseLtvNote}</p>
                    )}
                  </div>
                ) : (
                  <div style={{ background: "#F5F3EE", borderRadius: 14, padding: "1.5rem", textAlign: "center" }}>
                    <div style={{ fontSize: "0.875rem", color: "#526563" }}>{mm.reverseDesiredPayment}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer */}
        <p style={{ margin: "1.25rem 0 0", fontSize: "0.6875rem", color: "#7A8B82", lineHeight: 1.5 }}>
          {mm.disclaimer}
        </p>
      </div>
    </div>
  );
}
