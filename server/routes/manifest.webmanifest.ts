/** Web app manifest with the restaurant's name (one backoffice per restaurant, name from the env). */
export default defineEventHandler((event) => {
  const name = useRuntimeConfig(event).restaurantName;
  setHeader(event, "Content-Type", "application/manifest+json");
  setHeader(event, "Cache-Control", "public, max-age=3600");
  return {
    id: "/",
    name: `${name} Backoffice`,
    short_name: name.length > 12 ? "Backoffice" : name,
    description: "Bestellungen, Speisekarte und Öffnungszeiten",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#ff5b00",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
});
