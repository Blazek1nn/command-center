/**
 * Decorações zen — pinceladas, selos, montanhas e ondas em SVG.
 * Todas usam `currentColor` para herdar o tom da paleta (terracota,
 * tinta nanquim ou cinza médio, conforme o contexto).
 */
import * as React from "react";
import { cn } from "@/lib/utils";

interface BrushStrokeProps extends React.SVGAttributes<SVGSVGElement> {
  variant?: "horizontal" | "splash" | "long";
  thickness?: number;
}

/** Pincelada — divisor zen entre seções. */
export function BrushStroke({
  variant = "horizontal",
  thickness = 1.4,
  className,
  ...rest
}: BrushStrokeProps) {
  if (variant === "splash") {
    return (
      <svg
        viewBox="0 0 80 16"
        preserveAspectRatio="none"
        className={cn("h-3 w-20 text-foreground/35", className)}
        {...rest}
      >
        <path
          d="M2 9 C 12 4, 26 12, 38 7 S 56 11, 66 6 70 10 76 8"
          stroke="currentColor"
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="78" cy="9" r="0.7" fill="currentColor" />
      </svg>
    );
  }
  if (variant === "long") {
    return (
      <svg
        viewBox="0 0 320 8"
        preserveAspectRatio="none"
        className={cn("h-2 w-full text-foreground/30", className)}
        {...rest}
      >
        <path
          d="M2 4.4 C 40 1.5, 80 5.8, 130 3 S 220 5.4, 270 2.4 295 5.6 318 3.4"
          stroke="currentColor"
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 200 10"
      preserveAspectRatio="none"
      className={cn("h-2 w-full text-foreground/35", className)}
      {...rest}
    >
      <path
        d="M2 5.2 C 30 1.6, 64 7.4, 100 4.6 S 160 6.4, 198 3.6"
        stroke="currentColor"
        strokeWidth={thickness}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Selo hanko — pequeno carimbo terracota. */
export function InkSeal({
  label = "命",
  size = 28,
  className,
}: {
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "seal grid place-items-center rounded-[4px] font-display leading-none",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
      aria-hidden
    >
      {label}
    </span>
  );
}

/** Silhueta de montanhas em camadas — pano de fundo de hero. */
export function MountainHero({
  className,
  ...rest
}: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 600 200"
      preserveAspectRatio="xMidYEnd meet"
      className={cn("h-auto w-full text-foreground", className)}
      {...rest}
    >
      {/* Sol/lua — círculo terracota etéreo */}
      <circle cx="430" cy="60" r="34" fill="hsl(var(--primary))" opacity="0.10" />
      <circle cx="430" cy="60" r="22" fill="hsl(var(--primary))" opacity="0.18" />

      {/* Camada distante — clara */}
      <path
        d="M0 150 L 80 110 L 140 130 L 210 95 L 290 125 L 370 100 L 450 130 L 540 105 L 600 130 L 600 200 L 0 200 Z"
        fill="currentColor"
        opacity="0.07"
      />
      {/* Camada média */}
      <path
        d="M0 175 L 70 145 L 150 165 L 230 135 L 320 160 L 410 140 L 490 165 L 570 145 L 600 158 L 600 200 L 0 200 Z"
        fill="currentColor"
        opacity="0.13"
      />
      {/* Camada próxima — mais densa */}
      <path
        d="M0 195 L 60 175 L 140 188 L 240 172 L 340 188 L 440 175 L 540 188 L 600 178 L 600 200 L 0 200 Z"
        fill="currentColor"
        opacity="0.22"
      />
    </svg>
  );
}

/** Onda seigaiha discreta — usado como divisor lateral ou marca d'água. */
export function WavePattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pattern-seigaiha h-full w-full", className)}
      style={{ maskImage: "linear-gradient(to bottom, black, transparent)" }}
    />
  );
}

/** Bambu — marca vertical opcional. */
export function BambooMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 80"
      className={cn("h-16 w-3 text-foreground/25", className)}
      aria-hidden
    >
      <path
        d="M6 2 V 76"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      {[16, 36, 56].map((y) => (
        <ellipse
          key={y}
          cx="6"
          cy={y}
          rx="3.4"
          ry="1.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/** Ensō — círculo zen pintado a pincel (anel de logo). */
export function Enso({
  size = 48,
  className,
  ...rest
}: { size?: number; className?: string } & React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 60 60"
      width={size}
      height={size}
      className={cn("text-primary", className)}
      aria-hidden
      {...rest}
    >
      <path
        d="M 30 5 A 25 25 0 0 1 55 30 A 25 25 0 0 1 30 55 A 25 25 0 0 1 5 30 A 25 25 0 0 1 27.5 5.2"
        stroke="currentColor"
        strokeWidth="3.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.82"
      />
    </svg>
  );
}

/** EnsoLogo — selo dentro de um círculo ensō (marca da aplicação). */
export function EnsoLogo({
  label = "令",
  size = 40,
  className,
}: {
  label?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Enso
        size={size}
        className="absolute inset-0 text-primary"
        style={{ width: size, height: size }}
      />
      <span
        className="relative font-display font-semibold leading-none text-primary"
        style={{ fontSize: Math.round(size * 0.36) }}
      >
        {label}
      </span>
    </span>
  );
}

/** Ramo de sakura — galho com flores de cerejeira para decoração de cantos. */
export function SakuraBranch({
  className,
  ...rest
}: React.SVGAttributes<SVGSVGElement>) {
  const petal = (r: number) =>
    `M 0 0 C -${(r * 0.4).toFixed(1)} -${(r * 0.2).toFixed(1)}, -${(r * 0.4).toFixed(1)} -${(r * 0.88).toFixed(1)}, 0 -${r} C ${(r * 0.4).toFixed(1)} -${(r * 0.88).toFixed(1)}, ${(r * 0.4).toFixed(1)} -${(r * 0.2).toFixed(1)}, 0 0`;

  const Flower = ({ cx, cy, r = 7 }: { cx: number; cy: number; r?: number }) => (
    <g transform={`translate(${cx} ${cy})`} opacity="0.70">
      {[0, 72, 144, 216, 288].map((deg) => (
        <path key={deg} transform={`rotate(${deg})`} d={petal(r)} fill="currentColor" />
      ))}
      <circle cx="0" cy="0" r={r * 0.26} fill="currentColor" />
    </g>
  );

  return (
    <svg
      viewBox="0 0 220 165"
      preserveAspectRatio="xMaxYMin meet"
      className={cn("text-primary/55", className)}
      aria-hidden
      {...rest}
    >
      {/* Main branch */}
      <path
        d="M 12 158 C 45 122, 90 92, 132 62 C 158 44, 188 24, 210 12"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.50"
      />
      {/* Sub-branch 1 */}
      <path
        d="M 88 94 C 98 76, 106 60, 110 46"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Sub-branch 2 */}
      <path
        d="M 152 50 C 160 36, 164 22, 166 12"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        opacity="0.40"
      />
      <Flower cx={110} cy={44} r={8} />
      <Flower cx={166} cy={11} r={7} />
      <Flower cx={210} cy={12} r={7} />
      <Flower cx={152} cy={48} r={6} />
      <Flower cx={78} cy={104} r={6} />
      {/* Buds */}
      <circle cx={136} cy={62} r={3} fill="currentColor" opacity="0.40" />
      <circle cx={176} cy={30} r={2.5} fill="currentColor" opacity="0.34" />
      <circle cx={196} cy={18} r={2} fill="currentColor" opacity="0.28" />
    </svg>
  );
}

/** Silhueta de kitsune — marca d'água decorativa de fundo. */
export function FoxSilhouette({
  className,
  ...rest
}: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 88 108"
      className={cn("text-foreground/[0.065]", className)}
      aria-hidden
      {...rest}
    >
      {/* Tail curling to the right */}
      <path
        d="M 56 80 C 74 64, 78 42, 66 24 C 60 14, 48 18, 50 30 C 52 42, 63 56, 58 74 Z"
        fill="currentColor"
      />
      {/* Lower body */}
      <ellipse cx="36" cy="82" rx="22" ry="17" fill="currentColor" />
      {/* Upper body / torso */}
      <path
        d="M 18 70 C 16 52, 22 40, 36 36 C 50 40, 56 52, 54 70 Z"
        fill="currentColor"
      />
      {/* Head */}
      <ellipse cx="36" cy="26" rx="15" ry="18" fill="currentColor" />
      {/* Left ear — pointed */}
      <polygon points="22,16 13,0 31,14" fill="currentColor" />
      {/* Right ear */}
      <polygon points="50,16 59,0 41,14" fill="currentColor" />
      {/* Snout */}
      <ellipse cx="36" cy="36" rx="9" ry="7" fill="currentColor" />
    </svg>
  );
}

/** Dragão em nuvens — ilustração decorativa de hero. */
export function DragonCloud({
  className,
  ...rest
}: React.SVGAttributes<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 280 200"
      className={cn("text-foreground/[0.055]", className)}
      aria-hidden
      {...rest}
    >
      {/* Serpentine body */}
      <path
        d="M 22 182 C 52 148, 22 112, 62 86 C 98 62, 128 98, 162 70 C 196 42, 186 14, 164 17"
        stroke="currentColor"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
        opacity="0.88"
      />
      {/* Head */}
      <ellipse
        cx="163"
        cy="13"
        rx="12"
        ry="8"
        fill="currentColor"
        transform="rotate(-28 163 13)"
      />
      {/* Horns */}
      <path
        d="M 155 7 L 148 -3"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M 170 5 L 177 -3"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      {/* Cloud cluster 1 */}
      <g opacity="0.75">
        <circle cx="74" cy="78" r="13" fill="currentColor" />
        <circle cx="88" cy="69" r="11" fill="currentColor" />
        <circle cx="100" cy="76" r="10" fill="currentColor" />
      </g>
      {/* Cloud cluster 2 */}
      <g opacity="0.75">
        <circle cx="138" cy="95" r="12" fill="currentColor" />
        <circle cx="152" cy="86" r="10" fill="currentColor" />
        <circle cx="163" cy="94" r="9" fill="currentColor" />
      </g>
    </svg>
  );
}

/** Divisor ornamental — pontos flanqueando um selo centrado. */
export function OrnamentalDivider({
  label = "令",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 text-foreground/30",
        className,
      )}
      aria-hidden
    >
      <span className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-current" />
        ))}
      </span>
      <InkSeal label={label} size={18} className="opacity-60" />
      <span className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1 w-1 rounded-full bg-current" />
        ))}
      </span>
    </div>
  );
}
