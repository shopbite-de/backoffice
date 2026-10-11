# ADR 0001: Eigenes Backoffice statt Shopware Administration für das Restaurant-Personal

- Status: vorgeschlagen (2026-10-10), Entscheidung bei Lirim
- Kontext: Storefront ist seit 2.0 komplett eigenständig (Nuxt, eigene Komponenten). Die Shopware Administration ist für das Personal eines Restaurants überladen. Erstes Ziel: Pizzeria La Fattoria.

## Problem

Jedes Restaurant hat seine eigene Installation: eine Shopware-Instanz, eine Storefront (oder mehrere, eine pro Filiale) und einen Bon-Drucker (Order Printer). So läuft Pizzeria La Fattoria heute.

Das Personal pflegt den Shop selbst: Bestellungen, Bestellannahme, Öffnungszeiten, aber auch den ganzen Katalog (Abschnitte, Gerichte, Beschreibungen, Zutaten und andere Eigenschaften, Varianten, Extras, Schlagwörter, Maße, Upselling, SEO). In der Shopware Administration liegen diese Dinge zwischen Erlebniswelten, Themes, Regel-Baukasten, Vertriebskanälen und hunderten Einstellungen. Die Einstellungen, auf die es ankommt, stecken in der Plugin-Konfiguration. Wie Zutaten, Diät, Extras und Größen angelegt werden müssen, damit die Storefront sie richtig zeigt, steht nur in `storefront/CLAUDE.md`.

## Optionen

| | A: Shopware Admin entschlacken | B: Shopware App (Meteor Admin SDK) | C: Eigenes Backoffice auf der Admin API | D: Sylius als Backend |
|---|---|---|---|---|
| Idee | ACL-Rolle blendet Module aus, Plugin-Modul "Cockpit" als Startseite | Eigene Seiten als iFrame in der Admin | Nuxt-App neben der Shopware des Restaurants, spricht als angemeldeter Benutzer mit deren Admin API | Shopware ersetzen |
| Gastro-Sprache und Abläufe | teilweise, Rahmen bleibt Shopware | teilweise, Rahmen bleibt Shopware | ja, vollständig | nein, Sylius Admin hat dasselbe Problem |
| Datenmodell der Storefront einhalten | Personal muss es kennen | Personal muss es kennen | im Backoffice fest eingebaut | neu bauen |
| Handy/Tablet | schlecht (Admin ist Desktop) | schlecht | gut, von Anfang an | offen |
| Aufwand | klein | mittel | mittel bis groß | sehr groß |
| Wartung | Admin-Overrides brechen bei Updates | SDK stabil, Rahmen fix | Admin API ist versioniert und stabil, eigener Code zu pflegen | zweites Backend dauerhaft |

## Entscheidung (Empfehlung)

**Option C, als Teil jeder Restaurant-Installation.** Shopware bleibt der Commerce-Kern (Katalog, Preise, Steuern, Warenkorb, Checkout, Bestellungen, Zahlungen, Mails). Zu jeder Installation gehört ein Backoffice, so wie Storefront und Order Printer:

```
Installation Pizzeria La Fattoria (ein Dokploy-Stack)
├── Shopware          Commerce-Kern, Admin nur noch für ShopBite
├── Storefront(s)     eine pro Filiale, je ein Sales Channel
├── Order Printer     Bon-Drucker
└── Backoffice        z. B. backoffice.pizzeria-lafattoria.de, für das Personal
```

Die Shopware Administration bleibt bestehen, aber nur für das ShopBite-Team (Einrichtung, Zahlungsarten, Steuern, Mail-Vorlagen, Notfälle).

Leitplanken:

1. **Backend for Frontend.** Die App läuft als SPA, alle Shopware-Aufrufe gehen über Nitro-Server-Routen. Die Tokens liegen in einem versiegelten httpOnly-Cookie; der Browser sieht weder Token noch Shopware-URL. Das Backoffice spricht die Shopware im selben Stack über das interne Netz an.
2. **Shopware entscheidet über Rechte.** Jede Person im Restaurant hat einen eigenen Shopware-Benutzer mit einer schmalen ACL-Rolle, zum Start "ShopBite Management" (alles) oder "ShopBite Personal" (Bestellungen, Bestellannahme, Lieferzeit). Das Backoffice zeigt nur die Bereiche, die die Rolle erlaubt. Das Backoffice meldet mit Benutzername und Passwort bei Shopware an (OAuth Password Grant, Client `administration`) und ruft alles mit diesem Token auf. Es hat nie mehr Rechte als die Person, speichert keine Passwörter und hat keinen eigenen Schlüssel.
3. **Filialen sind Sales Channels.** Mehrere Storefronts eines Restaurants sind Sales Channels derselben Instanz. Das Personal ist über ein Custom Field am Shopware-Benutzer an seine Filiale gebunden und sieht nur deren Bestellungen; das Management sieht alle. Speisekarte, Öffnungszeiten und Einstellungen gelten für die im Kopf gewählte Filiale.
4. **Gastro-Begriffe statt Shopware-Entitäten.** Die API des Backoffice spricht von Gericht, Abschnitt, Zutaten, Extras, Größen, Bestellannahme, Ruhetag. Die Übersetzung in Produkte, Eigenschaften, Cross-Sellings, Varianten, System-Config und Zustandsautomaten passiert serverseitig an einer Stelle (`server/utils/dishes.ts` usw.). Damit ist das Datenmodell der Storefront eingebaut statt dokumentiert.
5. **Ein Speichern = eine Transaktion.** Schreibvorgänge mit mehreren Entitäten laufen als ein Sync-Request.
6. **Fachlogik, die Shopware nicht kennt, gehört ins Plugin** (z. B. "heute ausverkauft", schmale Einstellungs-Route, Menü-Kategorie pro Sales Channel, Gastro-Rollen).
7. **Order Printer hat Vorrang.** Das Backoffice nimmt eine Bestellung nie aus "open"; das macht der Drucker, wenn der Bon raus ist.

## Begründung

- Der PoC zeigt alle Kernabläufe mit einem eingeschränkten Gastro-Benutzer, inklusive vollständigem Gericht-Editor (Varianten, Eigenschaften, Extras, SEO), Abschnitten mit SEO-Pfaden und zwei Filialen (README, Abschnitt PoC-Ergebnis).
- Option A und B lösen das Kernproblem nicht; das Personal bräuchte weiter das Shopware-Datenmodell im Kopf.
- Option D tauscht das funktionierende Fundament aus, ohne die Bedienung zu lösen (Root-ADR `docs/adr/0001-shopware-einziges-backend.md`).
- Ein Backoffice pro Installation passt zum bestehenden Betrieb (ein Stack pro Restaurant wie bei La Fattoria): kein zentraler Dienst, der Zugang zu allen Instanzen hält, kein Mandanten-Register, Ausfall oder Update betrifft nur ein Restaurant, und die Admin API muss nicht öffentlich erreichbar sein.

## Konsequenzen

- Neuer Service `backoffice/` (bun, Nuxt 4, shadcn-vue) mit eigenem Repo und Docker-Image; jede Installation bekommt einen Container mehr (klein, Node). Konfiguration per Env: Shopware-URL, Restaurantname, Filialen mit Menü-Kategorie, Session-Secret.
- Allergene und Zusatzstoffe werden Pflichtfelder des Gerichts (Phase 1): feste Eigenschaftsgruppen mit Kürzel, Prüf-Häkchen je Gericht, Anzeige in der Storefront.
- Plugin bekommt: ACL-Rollen per Installer, CLI zum Anlegen von Personal-Benutzern, schmale Einstellungs-Route, "heute ausverkauft", Menü-Kategorie pro Sales Channel.
- Storefront braucht: Cache-Invalidierung (Produkte, Listings, Kategorien werden 24 h gecacht) und die Anzeige "heute ausverkauft" (ausgegraut, nicht bestellbar).
- Die Gastro-Rolle ist breit im Katalog (Produkte inklusive Löschen, Eigenschaften, Kategorien, SEO-URLs), aber ohne Kunden, Benutzer, Plugins, Zahlungsarten, Promotions.
- Zwei Oberflächen auf denselben Daten: Das Backoffice schreibt nur die Felder, die es kennt (Custom Fields werden zusammengeführt, fremde Währungen und Kategorien außerhalb der Karte bleiben erhalten).
