/** Nuxt's renderer announces itself with X-Powered-By; the other security headers are routeRules in nuxt.config.ts. */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("render:response", (response) => {
    if (response.headers) delete response.headers["x-powered-by"];
  });
});
