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
- **Weitere Anforderungen (2026-10-11):** als App installierbar (PWA), Anmeldung per Fingerabdruck/Biometrie (Passkey), Unterabschnitte in den Abschnitten, Button "Jetzt drucken" an jeder Bestellung.

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
- **UI:** shadcn-vue (Stil Mira, reka-ui) im ShopBite-CI (`docs/ci.md`), dicht mit Maus, auf Handy und Tablet automatisch touch-groß (`pointer-coarse`), Dark Mode nach Gerät oder umschaltbar.

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

### Phase 1: Fundament und Pflichtangaben (L)

Sammel-Issue: [shopbite-de/backoffice#10](https://github.com/shopbite-de/backoffice/issues/10) (Sub-Issues und Abhängigkeiten dort).

| Bereich | Issue |
|---|---|
| ACL-Rollen Management und Personal per Installer | shopware-plugin#32 |
| CLI `shopbite:staff:create`, Filialbindung am Benutzer | shopware-plugin#33 |
| Admin-Route Bestellannahme/Lieferzeit mit eigenem Recht (statt `system_config:*`) | shopware-plugin#34 |
| Menü-Kategorie pro Sales Channel als Plugin-Konfiguration | shopware-plugin#35, storefront#486, backoffice#3 |
| Allergene und Zusatzstoffe: feste Gruppen, Custom Fields, Anzeige im Shop | shopware-plugin#36, storefront#485 |
| Cache-Invalidierung der Storefront nach Kartenänderungen | storefront#484, backoffice#4 |
| "Jetzt drucken": Druckanforderung an der Bestellung, Order Printer druckt (auch Nachdruck) | shopware-plugin#37, order-printer#74, backoffice#8 |
| Anmeldung per Passkey (Fingerabdruck, Face ID), Spike zum OAuth-Grant zuerst | shopware-plugin#38, backoffice#7 |
| PWA: installierbar, Offline-Seite, Bildschirm wach auf "Heute" | backoffice#6 |
| Unterabschnitte (zwei Ebenen) | backoffice#9, storefront#487 |
| Repo-Setup (Lint, Vitest, Playwright, axe, CI), Docker-Image auf ghcr | backoffice#1, backoffice#2 |
| Login-Rate-Limit | backoffice#5 |
| Backoffice im Quickstart | shopbite#2 |
| `/admin` und Admin API von außen nur für ShopBite | shopware#13 |
| Rollout Pizzeria La Fattoria (Zugänge, Allergene der Karte erfassen, vier Wochen ohne Shopware-Admin) | shopware#14 |

### Phase 2: Katalog komplett (M), Ziel: La Fattoria pflegt die Karte selbst
1. Gericht anlegen, duplizieren, löschen; Fotos hochladen und sortieren.
2. Heute ausverkauft: Custom Field `shopbite_sold_out_until` (Datum, damit kein nächtlicher Job nötig ist), Plugin lehnt es im Warenkorb ab, Storefront graut die Karte aus. Schalter direkt in der Speisekarten-Liste.
3. Extras-Gerichte (ohne Abschnitt) eigens verwalten.
4. Inhalt und Grundpreis für Getränke (PAngV).
5. Weitere Rollen nach Bedarf (z. B. Fahrer, Filialleitung mit Karte nur für die eigene Filiale).

### Phase 3: Alltag (S–M)
- Bestelldetail (Bon-Ansicht, Telefon, Zahlungsart und -status), Ton und Push-Benachrichtigung bei neuer Bestellung (PWA), "bis heute Abend pausieren".
- Feiertage/Betriebsferien, Restaurant-Kontaktdaten.

### Phase 4: Lieferung (M–L)
- Liefergebiete als PLZ-Liste mit Mindestbestellwert und Gebühr pro Zone; das Plugin übersetzt in Versandart-Preise/Regeln oder prüft selbst im Checkout. Ersetzt den Rule Builder und behebt das "Valide Lieferung"-Problem von La Fattoria.

### Phase 5: Wachstum
- Gutscheine, Auswertungen (Umsatz, Top-Gerichte), Lead-Demos mit Demo-Zugang.

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
