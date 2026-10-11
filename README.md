# ShopBite Backoffice (PoC)

Einfache Verwaltung für das Personal eines Restaurants: Bestellungen von heute, Bestellannahme, Speisekarte mit vollständigem Gericht-Editor, Abschnitte, Öffnungszeiten. Ersetzt im Restaurant die Shopware Administration; Shopware bleibt der Commerce-Kern. Jede Restaurant-Installation (Shopware, Storefront pro Filiale, Order Printer) bekommt ihr eigenes Backoffice, erstes Ziel ist Pizzeria La Fattoria. Entscheidung: `docs/adr/0001-eigenes-backoffice-statt-shopware-admin.md`, Fahrplan: `docs/plan.md`.

## Starten

Gegen die Shopware aus dem Quickstart:

```bash
cd ../shopbite && docker compose up -d                       # Shopware :8000, Storefront :3000
cd ../backoffice
python3 -I scripts/add-poc-channel.py http://localhost:8000   # zweite Filiale "ShopBite Abholung"
python3 -I scripts/create-poc-users.py http://localhost:8000  # Rollen Management + Personal, drei Benutzer
cp .env.example .env                                          # NUXT_SESSION_PASSWORD setzen (>= 32 Zeichen), NUXT_SALES_CHANNELS optional
bun install
bun run dev                                                   # http://localhost:3010
```

| Benutzername | Passwort | Rolle | Filiale | sieht |
|---|---|---|---|---|
| `chef` | `chef-poc-1234` | Management (64 Rechte) | alle | Heute, Speisekarte, Öffnungszeiten |
| `theke` | `theke-poc-1234` | Personal (17 Rechte) | ShopBite | Heute (Bestellungen, Bestellannahme, Lieferzeit) |
| `abholung` | `abholung-poc-1234` | Personal | ShopBite Abholung | Heute |
| `admin` | `shopbite` | Shopware-Admin | alle | alles (nur zum Vergleich) |

Die Filiale steht im Custom Field `shopbite_sales_channel_ids` des Shopware-Benutzers. Personal ohne Filiale kommt nicht hinein.

Testbestellung: `SW_ACCESS_KEY=… scripts/place-test-order.sh SB-3` (Access Key aus `/config/storefront.env` des Stacks).

## Mit echten Daten testen (Pizzeria La Fattoria)

Eine zweite lokale Shopware auf Port 8100 mit der echten Karte von La Fattoria (nur der öffentliche Katalog aus der Store API, keine Kunden, keine Bestellungen):

```bash
cd ../shopbite
docker compose -p sb-lafattoria -f compose.yaml -f ../backoffice/scripts/compose.lafattoria.yaml up -d
cd ../backoffice
python3 -I scripts/import-from-shop.py                         # Abschnitte, Gerichte, Varianten, Extras, Eigenschaften
python3 -I scripts/add-poc-channel.py http://localhost:8100    # zweite Filiale
python3 -I scripts/create-poc-users.py http://localhost:8100   # chef, theke, abholung
# .env: NUXT_SHOPWARE_URL=http://localhost:8100, NUXT_RESTAURANT_NAME=Pizzeria La Fattoria
```

Rundlauf-Test über die ganze Karte (lädt jedes Gericht und speichert es unverändert, Shopware muss danach identisch sein): `bun run roundtrip`.

Erneut ausführen aktualisiert die Daten. Andere Shops: `--source`, `--key` (Access Key aus dem HTML der Storefront), `--source-menu`. Extras, die im Shop als Product Stream gepflegt sind, kommen als feste Liste an (backoffice#11). Entfernen: `docker compose -p sb-lafattoria down -v`.

## Konfiguration

| Env | Bedeutung |
|---|---|
| `NUXT_SHOPWARE_URL` | Shopware dieses Restaurants, im Stack die interne Adresse |
| `NUXT_RESTAURANT_NAME` | Name im Kopf der Seite |
| `NUXT_SALES_CHANNELS` | optional `channelId:menuCategoryId,…`, eine Filiale pro Eintrag in dieser Reihenfolge; leer = alle aktiven Sales Channels mit ihrer Navigationskategorie |
| `NUXT_SESSION_PASSWORD` | Schlüssel für das Session-Cookie, mindestens 32 Zeichen |

## Aufbau

- `server/utils/profile.ts`: Rolle, Bereiche und Filialen aus `/api/_info/me`; `server/middleware/auth.ts` ordnet jedem API-Bereich die nötige Rolle zu.
- `shared/utils/labels.ts`: fester Katalog der Allergene und Zusatzstoffe mit Kürzeln.
- `server/utils/adminApi.ts`: Login bei Shopware (Password Grant, Client `administration`), Token-Refresh, Aufrufe als angemeldeter Benutzer. Tokens nur im versiegelten httpOnly-Cookie (`server/utils/session.ts`).
- `server/utils/salesChannel.ts`: Filialen (Sales Channels) und die gewählte Filiale.
- `server/utils/dishes.ts`, `server/utils/sections.ts`: Übersetzung Gericht/Abschnitt ↔ Shopware (Produkt, Eigenschaften, Varianten, Cross-Selling, Custom Fields, Tags, SEO-URLs), Speichern als ein Sync-Request.
- `server/api/*`: die Gastro-API, Zod-validiert. Typen in `shared/types/backoffice.ts`.
- `app/`: SPA (`ssr: false`), shadcn-vue (Stil Mira, reka-ui, lucide, touch-groß auf Handy/Tablet, Dark Mode) mit Tailwind v4 im ShopBite-CI (`docs/ci.md`); Komponenten in `app/components/ui`.

## PoC-Ergebnis (2026-10-10, Shopware aus dem Quickstart)

Geprüft mit eingeschränkten Benutzern (Rechte in `docs/notes/management-privileges.json` und `personal-privileges.json`, kein Admin):

| Ablauf | Ergebnis |
|---|---|
| Login mit Shopware-Benutzer, falsches Passwort abgewiesen, ohne Login 401 | ✔ |
| Zwei Filialen (Sales Channels): Bestellungen beider mit Etikett, Filialwechsel, fremde Channel-ID abgewiesen | ✔ |
| Lieferzeit pro Filiale getrennt gespeichert | ✔ |
| Bestellungen von heute, Fertig/Stornieren ("Fertig" aus "neu" lehnt Shopware ab), Bestellannahme pausieren | ✔ |
| Gericht komplett speichern in einem Request (0,2 s): Name, Preis, neue Zutat, neue Eigenschaftsgruppe "Küche", vegan, Tags, Suchwörter, Gewicht, Upselling, SEO, zweite Extras-Liste, Varianten Größe × Teig = 6 Kinder mit richtigen Preisen | ✔ |
| Store API zeigt alles sofort (6 Varianten, Badges, Upselling, Meta-Titel, Extras) | ✔ |
| Entfernen: Variantengruppe, Extras-Liste, Tags, Diät, Zutaten verschwinden; bestehende Varianten behalten ID und Nummer | ✔ |
| Abschnitt anlegen (Shopware erzeugt die SEO-URL), verschieben, ausblenden, umbenennen, eigener SEO-Pfad; alter Pfad leitet in der Storefront mit 301 weiter; Pfad einer anderen Seite wird abgelehnt | ✔ |
| Öffnungszeiten als ganze Woche ersetzen (eine Transaktion) | ✔ |
| Personal: nur Heute; Speisekarte, Öffnungszeiten und Gericht-Änderung 403; Bestellannahme und Lieferzeit der eigenen Filiale speicherbar | ✔ |
| Filialbindung: Personal sieht nur Bestellungen der eigenen Filiale, fremde Bestellung stornieren 404, Wechsel in fremde Filiale 404, ohne Zuordnung kein Login | ✔ |
| Passwortänderung in Shopware beendet die Backoffice-Sitzung beim nächsten Refresh | ✔ |
| Echte Karte von La Fattoria (22 Abschnitte inkl. Unterabschnitte, 174 Gerichte, 216 Varianten, 38 Extras-Listen): alle 140 Gerichte der Karte laden und unverändert speichern, Shopware danach identisch | ✔ |
| Varianten ohne Konfigurator-Einstellungen (in der Administration bearbeitet): Editor zeigt sie, Speichern behält alle Kinder und ergänzt die Einstellungen | ✔ |
| Allergene (Weizen, Milch, Sellerie) und Zusatzstoff speichern: Store API zeigt sie mit Kürzel und Reihenfolge, "Angaben geprüft" erscheint in der Speisekarte; Zurücksetzen ergibt das Original | ✔ |
| Direktzugriff mit dem Gastro-Token auf `user`, `customer`, `integration`, `plugin`, `promotion` | 403 ✔ |

Erkenntnisse für den Plan:

1. OAuth-Parameter heißt `scope`, nicht `scopes` (wird sonst ignoriert).
2. Rollen und Benutzer anlegen braucht ein Token mit Scope `user-verified` → Benutzerverwaltung bleibt beim Plugin/CLI.
3. Einstellungen speichern braucht `system_config:create/update/delete` (gesamte Systemkonfiguration) → eigene Plugin-Route.
4. Die Storefront cacht Produkte, Listings und Kategorien 24 h → Cache-Invalidierung nötig.
5. Shopware-Benutzer und Eigenschaftsgruppen sind instanzweit → eine Instanz pro Restaurant, Filialen als Sales Channels.
6. Upsert fügt Zuordnungen (Kategorien, Eigenschaften, Tags) nur hinzu; entfernte müssen explizit in den Mapping-Tabellen gelöscht werden.
7. Personal braucht für Bestellannahme und Lieferzeit auch `system_config:delete` (Shopware löscht beim Speichern leere Werte) → um so wichtiger ist die eigene Plugin-Route.
8. Shopware kennt keine Bindung von Benutzern an Sales Channels; das Backoffice erzwingt sie, Shopware Administration und Admin API müssen deshalb von außen gesperrt sein.
9. Echte Daten finden, was Demodaten verbergen: Varianten ohne Konfigurator-Einstellungen wurden beim Speichern gelöscht, unveränderte Gerichte bekamen Standardwerte geschrieben, Variantenpreise den Steuersatz des Gerichts. Speichern schreibt jetzt nur, was sich ändert.
10. La Fattoria pflegt Extras als Product Stream (eine Liste für 38 Gerichte), der Editor kennt nur feste Listen (backoffice#11).
11. Das lokale Storefront-Image war vom 30.09. und kannte die 301-Weiterleitung alter SEO-Pfade (06.10.) noch nicht; `docker compose pull storefront` behebt das.
