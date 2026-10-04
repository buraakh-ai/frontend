"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { House, Menu, X } from "lucide-react";
import { GROUPS, MODULES, type ModuleGroup } from "@/lib/modules";

const SECTIONS = Object.keys(GROUPS) as ModuleGroup[];

const itemClass = "-mx-2 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[14px] font-medium transition-colors";

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <Image src="/agfintax-mark.png" alt="AG FinTax" width={60} height={36} priority className="h-9 w-auto shrink-0" />
      <div className="min-w-0">
        <div className="whitespace-nowrap font-display text-[15px] font-bold leading-tight text-navy">
          AGFinTax Growth Suite
        </div>
        <div className="text-xs text-muted">AI marketing &amp; growth</div>
      </div>
    </div>
  );
}

function ModuleNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const hubActive = pathname === "/";
  return (
    <nav className="space-y-5">
      <Link
        href="/"
        onClick={onNavigate}
        aria-current={hubActive ? "page" : undefined}
        className={`${itemClass} ${hubActive ? "bg-tint text-navy" : "text-ink hover:bg-canvas hover:text-navy"}`}
      >
        <House className={`size-4 ${hubActive ? "text-accent" : "text-muted"}`} aria-hidden />
        Growth Hub
      </Link>
      {SECTIONS.map((group) => (
        <div key={group}>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{GROUPS[group].section}</div>
          <ul>
            {MODULES.filter((m) => m.group === group).map(({ href, label, icon: Icon }) => {
              if (!href) {
                return (
                  <li key={label}>
                    <span className={`${itemClass} cursor-default text-muted/70`} title="Coming soon">
                      <Icon className="size-4" aria-hidden />
                      {label}
                      <span className="ml-auto rounded bg-canvas px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }
              const active = pathname.startsWith(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`${itemClass} ${active ? "bg-tint text-navy" : "text-ink hover:bg-canvas hover:text-navy"}`}
                  >
                    <Icon className={`size-4 ${active ? "text-accent" : "text-muted"}`} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: fixed left rail. */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col overflow-y-auto border-r border-line bg-white px-5 py-6 md:flex">
        <Brand />
        <div className="my-6 h-px bg-line" />
        <ModuleNav />
      </aside>

      {/* Mobile: top bar with a slide-down menu. */}
      <header className="sticky top-0 z-20 border-b border-line bg-white px-4 py-3 md:hidden">
        <div className="flex items-center justify-between">
          <Brand />
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close menu" : "Open menu"}
            className="rounded-md p-2 text-navy hover:bg-canvas"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <div className="pt-5 pb-2">
            <ModuleNav onNavigate={() => setOpen(false)} />
          </div>
        )}
      </header>
    </>
  );
}
