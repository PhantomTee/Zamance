"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { MobileMenu } from "./MobileMenu";
import { NAV_LINKS } from "./navLinks";
import { useSession } from "@/lib/useSession";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { token } = useSession();
  const isSignedIn = Boolean(token);

  return (
    <>
      <header className="relative z-10" style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <a href="/" aria-label="Zamance home">
            <Logo />
          </a>

          <nav className="hidden items-center gap-10 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--color-text)" }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <a
              href={isSignedIn ? "/dashboard" : "/connecting"}
              className="rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:shadow-lg active:scale-95"
              style={{ background: "#7342E2" }}
            >
              {isSignedIn ? "Dashboard" : "Sign in with Slack"}
            </a>
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
          >
            {open ? <X size={24} color="#192837" /> : <Menu size={24} color="#192837" />}
          </button>
        </div>
      </header>

      <MobileMenu open={open} onClose={() => setOpen(false)} isSignedIn={isSignedIn} />
    </>
  );
}
