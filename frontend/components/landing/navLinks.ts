export interface NavLink {
  label: string;
  href: string;
}

// Every entry is a distinct route - no same-page anchors, no duplicates.
export const NAV_LINKS: NavLink[] = [
  { label: "Balance", href: "/balance" },
  { label: "Docs", href: "/docs" },
  { label: "Security", href: "/security" },
  { label: "Privacy", href: "/privacy" },
  { label: "Support", href: "/support" },
  { label: "Dashboard", href: "/dashboard" },
];
