"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Megaphone, Menu, UserSearch, X, type LucideIcon } from "lucide-react";

type Module = { href: string; label: string; icon: LucideIcon };

// Add new modules here; they stack directly under the "Modules" label.
const MODULES: Module[] = [
  { href: "/ad-generator", label: "Ad generator", icon: Megaphone },
  { href: "/lead-source", label: "Lead source", icon: UserSearch },
];

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
  return (
    <nav>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Modules</div>
      <ul>
        {MODULES.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 font-display text-[15px] font-semibold transition-colors ${
                  active ? "bg-tint text-navy" : "text-ink hover:bg-canvas hover:text-navy"
                }`}
              >
                <Icon className={`size-4 ${active ? "text-accent" : "text-muted"}`} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: fixed left rail. */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-line bg-white px-5 py-6 md:flex">
        <Brand />
        <div className="my-8 h-px bg-line" />
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
