/* The installed till's manifest (3D, F16): starts on /register and keeps its
 * scope there, full screen. Served without a session: browsers fetch
 * manifests without cookies. The back office's own is app/manifest.ts. */
export function GET() {
  return Response.json({
    name: "Business OS Till",
    short_name: "Till",
    description: "Sell at the counter, online or off.",
    id: "/register",
    start_url: "/register",
    scope: "/register",
    display: "fullscreen",
    display_override: ["fullscreen", "standalone"],
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f766e",
  }, { headers: { "Content-Type": "application/manifest+json" } });
}
