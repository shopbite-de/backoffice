# Plan: ShopBite Backoffice

Stand 2026-10-10. Grundlage: ADR 0001 (Option C) und der PoC in diesem Repo.

Entschieden (Lirim, 2026-10-10 und 2026-10-11):

- **Pro Restaurant:** Jedes Restaurant hat seine eigene Installation aus Shopware, einer oder mehreren Storefronts (eine pro Filiale) und Bon-Drucker, so wie Pizzeria La Fattoria. Das Backoffice wird Teil dieser Installation. Ziel: dem Personal von La Fattoria eine einfachere Oberfläche als die Shopware Administration geben.
- **Heute ausverkauft:** das Gericht bleibt sichtbar, ausgegraut und nicht bestellbar.
- **Katalog beim Restaurant:** Preise, Abschnitte, Eigenschaften, Beschreibungen, Schlagwörter, Maße, Custom Fields (Upselling), Varianten, SEO, Cross-Selling.
- **Rollen:** mehrere Rollen, Start mit **Management** (alles) und **Personal** (Bestellungen, Bestellannahme, Lieferzeit).
- **Filialen:** Das Personal sieht **nur die eigene Filiale**.
- **Allergene und Zusatzstoffe:** Pflicht, kommen in **Phase 1**.
- **Technik:** bun als Paketmanager und Laufzeit für Skripte, shadcn-vue (reka-ui) als UI.

## Ziel

Das Personal erledigt alles im Backoffice, am Handy, Tablet oder PC. Die Shopware Administration öffnet niemand im Restaurant. ShopBite nutzt sie weiter für Einrichtung und Sonderfälle.

**Messbar:** La Fattoria arbeitet vier Wochen ohne Shopware-Admin-Zugang; jede Rückfrage "wo stelle ich X ein" wird ein Ticket.

## Nicht-Ziele (v1)

Erlebniswelten, Themes, Steuern, Zahlungsarten einrichten, Mail-Vorlagen, Rule Builder, Benutzerverwaltung durch das Restaurant, Plugins, Mehrsprachigkeit der Karte.

## Architektur (im PoC bestätigt)

```
Installation Pizzeria La Fattoria (ein Dokploy-Stack)
┌────────────────────────────────────────────────────────────────┐
│  Browser (SPA) ── backoffice.pizzeria-lafattoria.de             │
│     │  Session-Cookie, nur /api/* des Backoffice                │
│     ▼                                                          │
│  backoffice (Nitro, BFF) ──internes Netz──► Shopware Admin API  │
│                                             (Rolle "Gastronom") │
│  Storefront Filiale A ─┐                                       │
│  Storefront Filiale B ─┴──────────────────► Shopware Store API  │
│  Order Printer ───────────────────────────► Shopware Admin API  │
└────────────────────────────────────────────────────────────────┘
```

- **Login:** Benutzername + Passwort des eigenen Shopware-Benutzers. Das Backoffice prüft per Password Grant direkt bei Shopware und speichert das Passwort nie.
- **Rollen:** zwei Shopware-ACL-Rollen, "ShopBite Management" und "ShopBite Personal" (`docs/notes/*-privileges.json`). Das Backoffice liest beim Login und bei jedem Token-Refresh (10 min) `/api/_info/me` und leitet daraus ab, welche Bereiche die Person sieht (`server/utils/profile.ts`); Shopware prüft jeden Aufruf zusätzlich.
- **Filialbindung:** Custom Field `shopbite_sales_channel_ids` am Shopware-Benutzer. Personal ohne Zuordnung kommt nicht hinein, Management ohne Zuordnung sieht alle Filialen. Der Benutzer kann das Feld selbst nicht ändern (`PATCH /_info/me` lehnt es ab). Das Backoffice filtert Bestellungen, Filialwechsel und Statusänderungen danach.
- **Konfiguration per Env:** `NUXT_SHOPWARE_URL` (intern), `NUXT_RESTAURANT_NAME`, `NUXT_SALES_CHANNELS` (Filialen in Reihenfolge, je mit Menü-Kategorie), `NUXT_SESSION_PASSWORD`.
- **Filialen:** "Heute" zeigt die Bestellungen aller Filialen, die die Person sehen darf (mit Etikett); Speisekarte, Öffnungszeiten und Einstellungen gelten für die Filiale, die im Kopf gewählt ist.
- **Schreiben:** ein Gericht oder Abschnitt wird in **einem** Sync-Request gespeichert (eine Transaktion).
- **UI:** shadcn-vue (Stil nova, reka-ui), Komponenten liegen als eigener Code in `app/components/ui` und sind auf 44 px Touch-Ziele vergrößert; Inter lokal eingebunden, ShopBite-Grün als Primärfarbe.

## Bereiche und Stand

| Bereich | Inhalt | Shopware dahinter | PoC |
|---|---|---|---|
| **Heute** | Bestellungen der eigenen Filialen, Fertig/Stornieren, Umsatz, Bestellannahme pausieren | `order`, Zustandsautomat, Plugin-Config | ✔ |
| **Speisekarte: Abschnitte** | anlegen, umbenennen, sortieren, ein-/ausblenden, SEO-Titel/-Beschreibung, Adresse im Shop (alte leitet 301 weiter) | `category` (afterCategoryId), `seo_url` (isModified) | ✔ |
| **Speisekarte: Gericht** | Name, Beschreibung, auf der Karte, Abschnitte, Preis | `product` | ✔ |
| | Varianten (bis 3 Gruppen, 100 Kombinationen) mit Aufpreis | Konfigurator + Kinder, Aufpreis in `configuratorSetting.price` | ✔ |
| | Zutaten, vegetarisch/vegan, weitere Eigenschaften (z. B. Küche) | Eigenschaftsgruppen, fehlende Optionen werden angelegt | ✔ |
| | Extras-Listen (Extras, Beilagen) | Cross-Selling `productList` | ✔ |
| | Upselling, Bon-Druck, Zubereitungsfaktor | Custom Fields `shopbite_*` (zusammengeführt) | ✔ |
| | Maße, Gewicht, Schlagwörter, Suchwörter, SEO-Titel/-Beschreibung/Keywords | Produktfelder, `tag`, `customSearchKeywords` | ✔ |
| | Neues Gericht, duplizieren, löschen, Fotos | `product`, Media-Upload | |
| | Heute ausverkauft (ausgegraut) | neu: Plugin + Storefront | |
| **Allergene und Zusatzstoffe** | 14 Allergene (Getreide und Nüsse namentlich), 12 Zusatzstoffe, Häkchen "Angaben geprüft", Hinweis und Filter "Allergene fehlen" in der Speisekarte | Eigenschaftsgruppen `Allergene`/`Zusatzstoffe`, Kürzel in `shopbite_code`, Custom Field `shopbite_allergens_checked` | ✔ (Anzeige im Shop fehlt) |
| **Rollen und Filialen** | Management und Personal, Personal nur eigene Filiale | ACL-Rollen, User-Custom-Field | ✔ |
| **Öffnungszeiten** | Woche, mehrere Zeiten pro Tag | `shopbite_business_hour` | ✔ |
| | Feiertage, Betriebsferien | `shopbite_holiday` | |
| **Lieferung** | Abholung/Lieferung, Lieferzeit, Liefergebiete (PLZ), Mindestbestellwert, Gebühr | Versandarten, Preise, Regeln | Lieferzeit ✔ |
| **Restaurant** | Adresse, Telefon, Google-Profil | Plugin-Config | |

Bewusst nicht im Editor: **SEO-URLs von Gerichten.** Die Storefront hat keine Produktseiten; ein Gericht öffnet sich über `?produkt=<Nummer>` im Abschnitt (storefront#289). Eigene Produktpfade würden diese Deep Links brechen. Für Gerichte gibt es Titel, Beschreibung und Keywords, für Abschnitte zusätzlich die Adresse.

## Phasen

### Phase 0: Entscheidung (jetzt)
- ADR 0001 (Backoffice) und Root-ADR 0001 (Sylius einfrieren) annehmen oder ändern.
- Repo `shopbite-de/backoffice` anlegen, PoC übernehmen.

### Phase 1: Fundament und Pflichtangaben (M)
1. **Plugin:** ACL-Rollen "ShopBite Management" und "ShopBite Personal" per Installer (Muster `OrderPrinterRoleInstaller`), Rechte aus `docs/notes/management-privileges.json` (64) und `personal-privileges.json` (17), im PoC ermittelt.
2. **Plugin:** CLI `shopbite:staff:create <benutzername> --role=management|personal [--branch=<salesChannelId>]...` (Shopware verlangt für Benutzer und Rollen ein `user-verified`-Token, das das Backoffice nicht haben soll). Setzt das Custom Field `shopbite_sales_channel_ids`, das als Custom-Field-Set für `user` registriert wird.
3. **Plugin:** Admin-Route `/api/_action/shopbite/settings` mit eigenem Recht; ersetzt `system_config:*` (öffnet sonst die ganze Systemkonfiguration, auch für das Personal).
4. **Plugin:** Menü-Kategorie pro Sales Channel als Plugin-Config, damit Storefront und Backoffice dieselbe Quelle lesen (heute je ein Env in Storefront und Backoffice).
5. **Plugin:** Allergene und Zusatzstoffe: Eigenschaftsgruppen mit festen IDs und Kürzeln per Migration anlegen (statt beim ersten Speichern im Backoffice), Custom Fields `shopbite_code` (Option) und `shopbite_allergens_checked` (Produkt) registrieren, Store API liefert sie mit.
6. **Storefront:** Allergene und Zusatzstoffe beim Gericht zeigen (Kürzel mit Legende auf der Karte, Klartext im Gericht-Dialog) und Hinweis für Gerichte ohne geprüfte Angaben.
7. **Storefront:** Cache-Invalidierung (Route mit Secret, leert Produkt-, Listing- und Kategorie-Caches); das Backoffice ruft sie nach jeder Kartenänderung für jede Storefront der Installation auf (Liste per Env).
8. **Backoffice:** Repo-Setup (bun, ESLint/Prettier, Vitest für die Übersetzungen in `server/utils`, Playwright gegen den Quickstart, axe), Docker-Image (oven/bun) auf ghcr, Eintrag im Quickstart-Compose.
9. **Betrieb La Fattoria:** Backoffice in den Dokploy-Stack von La Fattoria, Domain z. B. `backoffice.pizzeria-lafattoria.de`, Benutzer für Management und Personal je Filiale anlegen, Allergene der Karte einmal mit dem Restaurant erfassen.
10. **Härtung:** Rate-Limit auf den Login; Shopware Administration (`/admin`) und Admin API von außen nur noch für ShopBite (Backoffice und Order Printer sprechen intern). Sonst könnte sich das Personal mit denselben Zugangsdaten in der Shopware Administration anmelden und dort alle Filialen sehen.

### Phase 2: Katalog komplett (M), Ziel: La Fattoria pflegt die Karte selbst
1. Gericht anlegen, duplizieren, löschen; Fotos hochladen und sortieren.
2. Heute ausverkauft: Custom Field `shopbite_sold_out_until` (Datum, damit kein nächtlicher Job nötig ist), Plugin lehnt es im Warenkorb ab, Storefront graut die Karte aus. Schalter direkt in der Speisekarten-Liste.
3. Extras-Gerichte (ohne Abschnitt) eigens verwalten.
4. Inhalt und Grundpreis für Getränke (PAngV).
5. Weitere Rollen nach Bedarf (z. B. Fahrer, Filialleitung mit Karte nur für die eigene Filiale).

### Phase 3: Alltag (S–M)
- Bestelldetail (Bon-Ansicht, Telefon, Zahlungsart und -status), Ton bei neuer Bestellung, "bis heute Abend pausieren".
- Feiertage/Betriebsferien, Restaurant-Kontaktdaten.

### Phase 4: Lieferung (M–L)
- Liefergebiete als PLZ-Liste mit Mindestbestellwert und Gebühr pro Zone; das Plugin übersetzt in Versandart-Preise/Regeln oder prüft selbst im Checkout. Ersetzt den Rule Builder und behebt das "Valide Lieferung"-Problem von La Fattoria.

### Phase 5: Wachstum
- Gutscheine, Auswertungen (Umsatz, Top-Gerichte), PWA fürs Küchentablet, Lead-Demos mit Demo-Zugang.

## Risiken und Antworten

| Risiko | Antwort |
|---|---|
| Admin API ändert sich | Nur DAL-Suche, Entity-Write, Sync und `_action`-Routen, stabil seit 6.4. CI gegen zwei Shopware-Versionen wie das Plugin. |
| Ein Container mehr pro Installation | Klein (Node, kein eigener Speicher), gleiches Image für alle Restaurants, Updates wie bei der Storefront. |
| Backoffice als Angriffsfläche | Keine eigenen Schlüssel: nur Benutzer-Tokens im versiegelten Cookie (10 min, Refresh), Rechte über die Shopware-Rolle. |
| Filialbindung kennt Shopware nicht | Das Backoffice erzwingt sie (Bestellungen, Statusänderung, Filialwechsel, Einstellungen). Shopware Administration und Admin API von außen sperren (Phase 1, Punkt 10). |
| Allergene unvollständig | Häkchen "Angaben geprüft" je Gericht; die Speisekarte zeigt und filtert Gerichte ohne Prüfung. |
| Storefront-Cache zeigt alte Preise | Phase 1, Punkt 5, vor dem ersten Kunden. |
| Zwei Oberflächen auf denselben Daten | Backoffice schreibt nur bekannte Felder, Custom Fields werden zusammengeführt. |
| Varianten-Logik | Kinder werden über ihre Optionen erkannt (stabile IDs und Nummern bleiben); Aufpreise im Konfigurator gespeichert. Mehrere Gruppen: Preis = Grundpreis + Summe der Aufpreise. |
| Order Printer und Backoffice ändern Zustände | Backoffice nimmt keine Bestellung aus "open". Fertig nur aus "in Arbeit". |

## Offene Fragen an Lirim

Keine offenen Fragen zum Zuschnitt. Vor Phase 1 nur noch: Entscheidung (ADR 0001) annehmen, dann lege ich Repo und Issues an.
