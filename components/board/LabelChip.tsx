import { cn } from "@/lib/utils";

/**
 * A label pill: tinted background + text mixed with the theme's foreground
 * so any palette color stays readable in light and dark mode.
 */
export function LabelChip({
  name,
  color,
  className,
  size = "sm",
}: {
  name: string;
  color: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        className,
      )}
      style={{
        backgroundColor: `${color}22`,
        color: `color-mix(in srgb, ${color} 62%, rgb(var(--fg)))`,
      }}
    >
      {name}
    </span>
  );
}

/** Default dot colour of a column when it has no custom colour. */
export function columnDot(kind: "TODO" | "DOING" | "DONE", color: string | null) {
  if (color) return color;
  return kind === "DONE" ? "#10b981" : kind === "DOING" ? "#0ea5e9" : "#94a3b8";
}
