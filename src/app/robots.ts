import type { MetadataRoute } from "next";

/*
  Deliberate: the whole app is disallowed. Guest auto login means every
  dashboard page renders for anonymous visitors, and neither the demo
  dataset nor a customer's view belongs in a search index. Revisit when a
  public marketing site exists.
*/
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
