"use client";

// Rendered in the viewer's timezone; the server's (UTC) date may differ, hence
// suppressHydrationWarning.
export function Today({ className }: { className?: string }) {
  const label = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return (
    <p className={className} suppressHydrationWarning>
      {label}
    </p>
  );
}
