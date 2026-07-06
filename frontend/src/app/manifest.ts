import type { MetadataRoute } from "next";

// The Web App Manifest. Includes a share_target so the OS share sheet can send
// text straight into Tend's capture page. `share_target` isn't in Next's
// Manifest type yet, so we extend it locally.
type ManifestWithShareTarget = MetadataRoute.Manifest & {
  share_target?: {
    action: string;
    method: "GET" | "POST";
    params: { title?: string; text?: string; url?: string };
  };
};

export default function manifest(): ManifestWithShareTarget {
  return {
    name: "Tend",
    short_name: "Tend",
    description: "A quiet app for what matters today.",
    start_url: "/today",
    display: "standalone",
    background_color: "#0f0f0f",
    theme_color: "#0f0f0f",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    share_target: {
      action: "/capture",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
