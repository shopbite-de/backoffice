import tailwindcss from "@tailwindcss/vite";

export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  devtools: { enabled: false },
  ssr: false,
  modules: ["shadcn-nuxt"],
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
      ],
      link: [{ rel: "icon", href: "/favicon.ico" }],
      // dark mode before the first paint, no flash (see app/composables/useColorMode.ts)
      script: [
        {
          innerHTML:
            "try{var m=localStorage.getItem('sb-color-mode');if(m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}",
        },
      ],
    },
  },
  runtimeConfig: {
    // Server only: the browser never sees a Shopware URL or a token.
    // One backoffice per restaurant, next to its own Shopware (see .env.example).
    shopwareUrl: "http://localhost:8000", // NUXT_SHOPWARE_URL
    restaurantName: "Backoffice", // NUXT_RESTAURANT_NAME
    salesChannels: "", // NUXT_SALES_CHANNELS, "channelId:menuCategoryId,..."
    session: {
      password: "", // NUXT_SESSION_PASSWORD, at least 32 characters
    },
  },
});
