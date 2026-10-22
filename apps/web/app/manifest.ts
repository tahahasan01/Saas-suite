import type { MetadataRoute } from "next";

/** Installable till (3D, F16): opens straight on the register, full screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business OS",
    short_name: "Business OS",
    description: "Sell, track customers and run your staff.",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#0f766e",
  };
}
