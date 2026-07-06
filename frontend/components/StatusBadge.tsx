const STYLES: Record<string, { text: string; dot: string }> = {
  pending_approval: { text: "text-yellow-700", dot: "bg-yellow-500" },
  awaiting_signatures: { text: "text-blue-700", dot: "bg-blue-500" },
  executed: { text: "text-green-700", dot: "bg-green-500" },
  failed: { text: "text-red-700", dot: "bg-red-500" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? { text: "text-foreground/70", dot: "bg-foreground/40" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden />
      {status.replace(/_/g, " ")}
    </span>
  );
}
