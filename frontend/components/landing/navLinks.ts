export interface NavLink {
  label: string;
  href: string;
}

// Every entry is a distinct route - no same-page anchors, no duplicates. Dashboard is
// deliberately not listed here - the primary CTA button already goes there once signed in,
// listing it twice in the same header was redundant.
export const NAV_LINKS: NavLink[] = [
  { label: "Balance", href: "/balance" },
  { label: "Docs", href: "/docs" },
  { label: "Security", href: "/security" },
  { label: "Privacy", href: "/privacy" },
  { label: "Support", href: "/support" },
];
