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
  // Defense in depth: never render non-http(s) / non-image data URLs.
  if (url && /^(https?:\/\/|data:image\/(png|jpe?g|gif|webp);)/i.test(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        title={name}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={name}
      aria-label={name}
      className={cn("inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: colorFromString(name),
        fontSize: Math.max(9, Math.round(size * 0.4)),
      }}
    >
      {initials(name)}
    </span>
  );
}
