import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://tendyourgarden.app",
      lastModified: new Date(),
      priority: 1.0,
    },
    {
      url: "https://tendyourgarden.app/login",
      lastModified: new Date(),
      priority: 0.5,
    },
    {
      url: "https://tendyourgarden.app/signup",
      lastModified: new Date(),
      priority: 0.7,
    },
  ];
}
