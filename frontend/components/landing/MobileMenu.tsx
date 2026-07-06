"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { NAV_LINKS } from "./navLinks";

export function MobileMenu({
  open,
  onClose,
  isSignedIn,
}: {
  open: boolean;
  onClose: () => void;
  isSignedIn: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(25,40,55,0.35)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed right-0 top-0 z-50 flex flex-col"
            style={{
              width: "min(88vw, 360px)",
              height: "100dvh",
              background: "#CFC8C5",
              boxShadow: "-12px 0 48px rgba(25,40,55,0.18)",
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{
              duration: open ? 0.45 : 0.35,
              ease: open ? [0.22, 1, 0.36, 1] : [0.55, 0, 1, 0.45],
            }}
          >
            <div className="flex items-center justify-between px-6 py-5">
              <Logo />
              <motion.button
                onClick={onClose}
                whileTap={{ scale: 0.9 }}
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: "rgba(25,40,55,0.1)" }}
                aria-label="Close menu"
              >
                <X size={20} color="#192837" />
              </motion.button>
            </div>

            <div className="mx-6 h-px" style={{ background: "rgba(25,40,55,0.12)" }} />

            <nav className="flex flex-1 flex-col gap-1 px-4 py-6">
              {NAV_LINKS.map((link, i) => (
                <motion.a
                  key={link.label}
                  href={link.href}
                  onClick={onClose}
                  initial={{ x: 24, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.18 + i * 0.07, duration: 0.4 }}
                  className="rounded-xl px-3 py-3 font-medium hover:bg-black/10"
                  style={{ fontSize: "1.1rem", color: "#192837" }}
                >
                  {link.label}
                </motion.a>
              ))}
            </nav>

            <div className="flex flex-col gap-3 px-6 pb-8">
              <a
                href={isSignedIn ? "/dashboard" : "/connecting"}
                className="rounded-full py-3.5 text-center font-semibold text-white"
                style={{ background: "#7342E2", fontSize: "0.95rem" }}
              >
                {isSignedIn ? "Dashboard" : "Sign in with Slack"}
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
