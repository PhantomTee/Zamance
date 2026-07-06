"use client";

import { motion } from "framer-motion";
import { ArrowRightCircle } from "lucide-react";
import { fadeUp } from "@/lib/motion";
import { SLACK_LOGIN_URL } from "@/lib/config";
import { useSession } from "@/lib/useSession";
import { RotatingHeadline } from "./RotatingHeadline";

export function Hero() {
  const { token } = useSession();
  const isSignedIn = Boolean(token);

  return (
    <section
      className="relative z-10 mx-auto"
      style={{ maxWidth: 1280, paddingTop: "clamp(40px, 8vw, 72px)", paddingBottom: 48 }}
    >
      <div className="mx-auto flex flex-col items-center px-5" style={{ maxWidth: 660 }}>
        <motion.h1
          custom={0}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-center"
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "clamp(1.65rem, 5vw, 3rem)",
            lineHeight: 1.05,
            letterSpacing: "-0.01em",
            color: "var(--color-text)",
          }}
        >
          <RotatingHeadline />
        </motion.h1>

        <motion.p
          custom={1}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="text-center"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "clamp(0.9rem, 2.5vw, 1.1rem)",
            color: "var(--color-text)",
            opacity: 0.8,
            maxWidth: 560,
            lineHeight: 1.65,
            marginTop: 20,
          }}
        >
          Zero leaks, full control. Encrypted amounts, multisig custody, and Slack-native
          payouts for teams that move fast.
        </motion.p>

        <motion.a
          href={isSignedIn ? "/dashboard" : SLACK_LOGIN_URL}
          custom={2}
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          whileHover={{ scale: 1.04, filter: "brightness(1.1)" }}
          whileTap={{ scale: 0.96 }}
          className="flex items-center text-white"
          style={{
            marginTop: 32,
            borderRadius: 50,
            background: "#7342E2",
            fontSize: "clamp(0.9rem, 2vw, 1rem)",
            padding: "17px 24px",
            minWidth: 210,
            boxShadow: "0 4px 24px rgba(115,66,226,0.28)",
            justifyContent: "space-between",
            gap: 32,
          }}
        >
          {isSignedIn ? "Go to dashboard" : "Sign in with Slack"}
          <ArrowRightCircle size={20} />
        </motion.a>
        <p
          className="text-center"
          style={{ marginTop: 14, fontSize: "0.8rem", color: "var(--color-text)", opacity: 0.55 }}
        >
          New to Zamance? Signing in installs it to your workspace automatically.
        </p>
      </div>
    </section>
  );
}
