import { cn, initials, colorFromString } from "@/lib/utils";

export function Avatar({
  name,
  url,
  size = 32,
  className,
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={name}
        width={size}
        height={size}
        className={cn("rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center rounded-full font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: colorFromString(name),
        fontSize: Math.max(10, size * 0.38),
      }}
    >
      {initials(name)}
    </div>
  );
}