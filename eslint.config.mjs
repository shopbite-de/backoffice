// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  // shadcn-vue components are generated (bunx shadcn-vue add) and only adjusted
  { ignores: ["app/components/ui/**"] },
  {
    rules: {
      // Prettier owns formatting and writes void elements as <img />
      "vue/html-self-closing": "off",
    },
  },
);
