import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Fleet" },
  { to: "/api-reference", label: "API reference" },
  { to: "/settings", label: "Report settings" },
] as const;

export function SiteNav() {
  return (
    <nav className="mb-8 flex flex-wrap gap-1 border-b border-border pb-3">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: link.to === "/" }}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
