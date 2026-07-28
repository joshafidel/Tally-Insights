import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tally Insights",
    short_name: "Tally Insights",
    description:
      "District sentiment intelligence for legislative and government affairs teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8fd",
    theme_color: "#5c3792",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
