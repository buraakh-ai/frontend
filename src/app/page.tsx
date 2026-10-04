import type { Metadata } from "next";
import Link from "next/link";
import { Volume1 } from "lucide-react";
import { GROUPS, MODULES, type Module, type ModuleGroup } from "@/lib/modules";
import { Today } from "./today";

export const metadata: Metadata = { title: "Growth Hub · AGFinTax Growth Suite" };

const TONES: Record<ModuleGroup, { tile: string; badge: string }> = {
  create: { tile: "bg-accent/10 text-accent", badge: "bg-accent/10 text-accent" },
  source: { tile: "bg-tint text-ocean", badge: "bg-tint text-ocean" },
  leads: { tile: "bg-navy/10 text-navy", badge: "bg-navy/10 text-navy" },
  activate: { tile: "bg-success/10 text-success", badge: "bg-success/10 text-success" },
};

export default function GrowthHub() {
  return (
    <div className="space-y-8">
      <header>
        <div>
          <Today className="text-sm font-semibold text-accent" />
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-[40px] md:leading-tight">Welcome back</h1>
          <p className="mt-1.5 text-[15px] text-muted">
            Create campaigns, capture leads from every source, and activate them in Zoho.
          </p>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-2xl bg-navy px-6 py-8 text-white md:px-10 md:py-10">
        <div className="relative z-10 max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">AI marketing &amp; growth</p>
          <h2 className="mt-3 text-2xl font-bold leading-tight text-white md:text-[32px]">
            Turn every campaign into conversations with clients.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/75">
            Create ads, capture leads from the web, Bitrix24 and Zoom, and nurture them in Zoho — from one workspace.
          </p>
        </div>
        <HeroArt />
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">Modules</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.filter((m) => !m.navOnly).map((m) => (
            <ModuleCard key={m.label} module={m} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ModuleCard({ module: { label, description, icon: Icon, group, href } }: { module: Module }) {
  const tone = TONES[group];
  const body = (
    <>
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${tone.tile}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="font-display text-[17px] font-bold leading-snug text-navy">{label}</span>
          <span
            className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.badge}`}
          >
            {GROUPS[group].badge}
          </span>
        </span>
        <span className="mt-1 block text-[13px] leading-relaxed text-muted">{description}</span>
        {!href && <span className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-muted/70">Coming soon</span>}
      </span>
    </>
  );
  const base = "flex gap-4 rounded-xl border border-line bg-white p-5 shadow-sm";
  return href ? (
    <Link href={href} className={`${base} transition hover:-translate-y-0.5 hover:border-navy/20 hover:shadow-md`}>
      {body}
    </Link>
  ) : (
    <div className={`${base} opacity-75`}>{body}</div>
  );
}

// Decorative growth chart: rising bars, trend arrow, megaphone card and two contacts.
function HeroArt() {
  return (
    <svg
      viewBox="0 0 320 200"
      aria-hidden
      className="pointer-events-none absolute -right-4 bottom-0 hidden h-full w-[46%] max-w-md md:block"
    >
      <g fill="#1b1c73">
        <rect x="128" y="130" width="30" height="70" rx="4" opacity="0.7" />
        <rect x="170" y="105" width="30" height="95" rx="4" opacity="0.85" />
        <rect x="212" y="78" width="30" height="122" rx="4" />
      </g>
      <rect x="254" y="38" width="30" height="162" rx="4" fill="#fa5f11" />
      <path d="M118 150 Q 190 120 268 30" fill="none" stroke="#f8a46f" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M254 30 L272 24 L268 42" fill="none" stroke="#f8a46f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="148" cy="28" r="3" fill="#fa5f11" />
      <circle cx="300" cy="62" r="2" fill="#ffffff" opacity="0.5" />
      <circle cx="110" cy="96" r="2" fill="#ffffff" opacity="0.4" />
      <foreignObject x="70" y="34" width="56" height="44">
        <div className="flex size-full items-center justify-center rounded-xl bg-white shadow-lg">
          <Volume1 className="size-6 text-accent" strokeWidth={2.5} />
        </div>
      </foreignObject>
      <Person cx={100} cy={146} />
      <Person cx={296} cy={110} r={15} />
      <path d="M292 160 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#f8a46f" />
    </svg>
  );
}

function Person({ cx, cy, r = 11 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#ffffff" />
      <circle cx={cx} cy={cy - r * 0.25} r={r * 0.3} fill="#03045e" />
      <path
        d={`M${cx - r * 0.5} ${cy + r * 0.55} a${r * 0.5} ${r * 0.45} 0 0 1 ${r} 0`}
        fill="#03045e"
      />
    </g>
  );
}
