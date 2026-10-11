# CLAUDE.md

Backoffice for a restaurant's staff (PoC, 2026-10-10): Nuxt 4 SPA (bun, shadcn-vue) with a Nitro backend-for-frontend on the Shopware Admin API. Every restaurant installation (own Shopware, one storefront per branch, order-printer, like Pizzeria La Fattoria) runs its own backoffice, configured by env (`.env.example`). Replaces the Shopware Administration for restaurant staff; Shopware stays the commerce core. Read `docs/adr/0001-eigenes-backoffice-statt-shopware-admin.md` and `docs/plan.md` first. Part of the ShopBite monorepo, see `../CLAUDE.md`.

## Commands

```bash
bun install
bun run dev       # http://localhost:3010, needs the quickstart stack, see README
bun run typecheck # must stay at zero errors
bun run build
bunx shadcn-vue@latest add <component>   # see "shadcn" below
```

## Rules

- The browser only calls `/api/*` of this app. Shopware tokens live in the sealed session cookie (`server/utils/session.ts`); never return a token or the Shopware URL to the client.
- Every Shopware call goes through `adminApi()` / `adminSearch()` with the logged-in user's token, so Shopware's ACL decides. Never add an integration key with more rights. No central service, no tenant registry: one deployment talks to one Shopware.
- The API speaks restaurant terms (`shared/types/backoffice.ts`); translation to Shopware entities happens only in `server/`. Validate every request body with Zod.
- Multi-entity writes (dish, section) are ONE `/_action/sync` request. Upserts only add mapping rows; delete removed ones explicitly (`product_property`, `product_category`, `product_tag`, …). Write only fields the backoffice knows; merge custom fields; keep other currencies and categories outside the menu.
- Never edit product SEO URLs: the storefront opens dishes via `?produkt=` (storefront#289). Category SEO URLs are fine (old path stays as non-canonical alias, storefront redirects 301).
- Branches are sales channels. Menu, hours and settings are per selected channel (`currentSalesChannel`), orders span the person's channels (`restaurantChannels`).
- Roles: capabilities come from the Shopware privileges in `/_info/me` (`server/utils/profile.ts`, Management = `product:update`). Every API area is mapped to a capability in `server/middleware/auth.ts`, every page sets `definePageMeta({ capability })`. Branch binding is the user custom field `shopbite_sales_channel_ids`; Shopware does not know it, so anything touching an order or a channel must check against `restaurantChannels()`.
- Allergens and additives are a fixed catalogue (`shared/utils/labels.ts`), stored as property groups "Allergene"/"Zusatzstoffe" with `shopbite_code`. Never let them become free text; keep unknown options of these groups when saving.
- Never move an order out of `open`: the order-printer does that after printing (`../order-printer`).
- New Shopware privileges the app needs go into `docs/notes/management-privileges.json` or `personal-privileges.json`, then `python3 -I scripts/create-poc-users.py`, later the plugin's role installer.
- UI follows the ShopBite CI (`docs/ci.md`): tokens in `app/assets/css/main.css` (primary `#cc4800`, never the raw brand orange for text), Public Sans self-hosted, logo in `public/brand/`, warnings use the yellow `warning` tokens. shadcn-vue components from `app/components/ui` (owned code, auto-imported without prefix), sized up to 44 px targets; app components `FormSection`, `ListField`, `ErrorAlert`. Visible focus, `role="alert"` / `role="status"` instead of toasts, German copy without dashes as sentence connectors.
- shadcn: reka-ui sets `data-state="checked"`, the nova styles use `data-checked:`; `main.css` maps the variants. On this machine the CLI breaks on Debian's `/usr/share/nodejs/eslint-scope` ("Invalid Version: main"): run `bun add -d eslint-scope@9.1.2` before `shadcn-vue add` and `bun remove eslint-scope` after. After adding a component, enlarge `h-8`/`size-4` defaults like the existing ones.
