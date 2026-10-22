/* The back office as an installed app. The till has its own manifest, scoped
 * to /register (app/register.webmanifest, 3D). Route handlers rather than
 * app/manifest.ts: a file-based manifest is linked on every page and the
 * till's layout could not replace it. */
export function GET() {
  return Response.json({
    name: "Business OS",
    short_name: "Business OS",
    description: "Sell, track customers and run your staff.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f766e",
  }, { headers: { "Content-Type": "application/manifest+json" } });
}
