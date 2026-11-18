import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  devtools: { enabled: false },
  ssr: false,
  modules: ["shadcn-nuxt", "@nuxt/eslint", "@vite-pwa/nuxt"],
  shadcn: { prefix: "", componentDir: "./app/components/ui" },
  css: ["~/assets/css/main.css"],
  vite: { plugins: [tailwindcss()] },
  app: {
    head: {
      htmlAttrs: { lang: "de" },
      title: "ShopBite Backoffice",
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { name: "robots", content: "noindex, nofollow" },
        { name: "theme-color", content: "#ffffff" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      ],
      link: [
        { rel: "icon", href: "/favicon.ico" },
        // served by server/routes/manifest.webmanifest.ts (restaurant name from the env)
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      ],
      // dark mode before the first paint, no flash (see app/composables/useColorMode.ts)
      script: [
        {
          innerHTML:
            "try{var m=localStorage.getItem('sb-color-mode');if(m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}",
        },
      ],
    },
  },
  // Installable app (backoffice#6). The service worker precaches the app shell only, never
  // /api responses: orders must always be live. The manifest comes from a server route.
  pwa: {
    registerType: "autoUpdate",
    manifest: false,
    client: { installPrompt: true },
    generateSW: {
      navigateFallback: "/",
      navigateFallbackDenylist: [/^\/api\//],
      globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
      runtimeCaching: [],
      // was the default of the 1.x module; drops precaches of older Workbox versions
      cleanupOutdatedCaches: true,
    },
  },
  // on every response, the app shell and /api alike
  routeRules: {
    "/**": {
      headers: {
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy": "frame-ancestors 'none'",
        "Referrer-Policy": "same-origin",
      },
    },
  },
  // the SPA shell as a file, so the service worker can serve it offline
  nitro: { prerender: { routes: ["/"] } },
  runtimeConfig: {
    // Server only: the browser never sees a Shopware URL or a token.
    // One backoffice per restaurant, next to its own Shopware (see .env.example).
    shopwareUrl: "http://localhost:8000", // NUXT_SHOPWARE_URL
    restaurantName: "Backoffice", // NUXT_RESTAURANT_NAME
    salesChannels: "", // NUXT_SALES_CHANNELS, "channelId:menuCategoryId,..."
    // storefronts whose cache is emptied after a menu change (storefront#484)
    storefrontUrls: "", // NUXT_STOREFRONT_URLS, "https://shop-a.de,https://shop-b.de"
    cachePurgeSecret: "", // NUXT_CACHE_PURGE_SECRET, same value as in the storefronts
    // public address(es) of this backoffice, comma separated; writes from any other origin are refused.
    // Empty = the request's Host header (the reverse proxy passes it through unchanged).
    origin: "", // NUXT_ORIGIN, "https://backoffice.mein-restaurant.de"
    // reverse proxies in front of the container that append to X-Forwarded-For (login rate limit)
    trustedProxies: 1, // NUXT_TRUSTED_PROXIES, 0 = reachable directly
    session: {
      password: "", // NUXT_SESSION_PASSWORD, at least 32 characters
      // NUXT_SESSION_SECURE=false only for plain http outside localhost-aware browsers (quickstart)
      secure: true,
    },
  },
});
