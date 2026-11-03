"use client";

import Image from "next/image";
import Link from "next/link";

/** Aspect ratio of the Haveniq logotype SVG (3709 × 1000) */
const RATIO = 3709 / 1000;

interface LogoProps {
  /** "default" = teal on ivory; "light" = white on dark */
  variant?: "default" | "light";
  /** Height in px. Width is calculated from the SVG aspect ratio. */
  height?: number;
  href?: string;
  className?: string;
}

export function Logo({ variant = "default", height = 20, href, className = "" }: LogoProps) {
  const src =
    variant === "light" ? "/images/brand/logo-light.svg" : "/images/brand/logo.svg";
  const img = (
    <Image
      src={src}
      alt="Haveniq"
      width={Math.round(height * RATIO)}
      height={height}
      className={className}
      priority
    />
  );
  if (!href) return img;
  return (
    <Link href={href} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none", flexShrink: 0 }}>
      {img}
    </Link>
  );
}
