# ShopBite CI

Stand 2026-10-11. Gilt für die Oberflächen von ShopBite selbst: Homepage, Doku, Backoffice. **Nicht** für die Shops der Restaurants: Die Storefront trägt die Marke des Restaurants (Presets Trattoria, Grill, Asia).

Quelle ist die Homepage (`homepage/app/assets/css/main.css`, `app/app.config.ts`, Logos in `homepage/public/images/`). Ändert sich dort etwas, wird diese Datei angepasst.

## Logo

| Datei | Einsatz |
|---|---|
| `public/brand/shopbite-logo.svg` | auf hellem Grund ("Shop" in `#3d3d3d`, Funke und Bindung in `#ff5b00`) |
| `public/brand/shopbite-logo-white.svg` | auf dunklem Grund |
| `public/favicon.ico` | Favicon (Funke) |

Das Logo nie umfärben, verzerren oder mit Schatten versehen. Mindesthöhe 24 px, Schutzraum rundherum mindestens die Höhe des Funkens. Alt-Text "ShopBite".

Im Backoffice steht das Logo klein über dem Namen des Restaurants: Das Restaurant ist die Hauptsache, ShopBite der Absender.

## Farben

| Token | Wert | Einsatz | Kontrast |
|---|---|---|---|
| Markenorange | `#ff5b00` | Logo, Flächen und Grafiken ohne Text, Dark Mode Primär | 3,1:1 auf Weiß, nur für große Elemente |
| `--primary` | `#cc4800` | Buttons, aktive Schalter, Fokusrahmen, Links | 4,67:1 mit weißer Schrift |
| `--accent` / `--accent-foreground` | `#fff0e6` / `#a33a00` | aktive Navigation, zarte Hervorhebung | 5,96:1 |
| `--foreground` | `#3d3d3d` | Text (Logo-Grau) | 10,4:1 auf `#fafafa` |
| `--muted-foreground` | `#5c5c5c` | Nebentext | 6,4:1 auf `#fafafa` |
| `--background` / `--card` | `#fafafa` / `#ffffff` | Seite / Karten | |
| `--border` / `--input` | `#e5e5e5` / `#8a8a8a` | Trennlinien / Rahmen von Eingabefeldern | Eingaben 3,45:1 (WCAG 1.4.11) |
| `--warning` / `--warning-foreground` / `--warning-border` | `#fef9c3` / `#713f12` / `#ca8a04` | Hinweise (pausiert, Allergene fehlen), bewusst Gelb statt Orange | 8,1:1 |
| `--destructive` | `#b91c1c` | Stornieren, Fehler | 6,5:1 |
| `--success` | `#15803d` | "Gespeichert" direkt an der Änderung (`SaveStatus`) | 5,0:1 |

Grautöne sind neutral (kein Blau- oder Braunstich), wie `neutral` in der Homepage.

### Dark Mode

Folgt der Einstellung des Geräts, umschaltbar (wie Gerät, Hell, Dunkel), gespeichert pro Gerät.

| Token | Wert | Kontrast |
|---|---|---|
| `--background` / `--card` / `--muted` | `#141414` / `#1e1e1e` / `#262626` | |
| `--foreground` / `--muted-foreground` | `#ededed` / `#a3a3a3` | 14,2:1 / 6,6:1 auf Karten |
| `--primary` | `#ff5b00` (Markenorange), Schrift darauf `#141414` | 5,4:1 auf Karten, 5,9:1 Schrift auf Orange |
| `--accent` / `--accent-foreground` | `#3a2010` / `#ffb07a` | 8,4:1 |
| `--input` | `#737373` | 3,5:1 |
| `--warning` / `--warning-foreground` / `--warning-border` | `#3b2f07` / `#fde68a` / `#a16207` | 10,6:1 |
| `--destructive` | `#f87171` | 6,0:1 |
| `--success` | `#4ade80` | 9,6:1 |

Logo im Dunkeln: `shopbite-logo-white.svg`.

## Schrift

**Public Sans**, im Backoffice selbst gehostet (`@fontsource-variable/public-sans`, kein Google Fonts). Gewichte 400, 500, 600. Seitentext 16 px, Komponenten mit Maus 12 px (Mira), auf Touch-Geräten Eingabefelder 16 px (sonst zoomt iOS beim Antippen).

## Formen und Bedienung

- Komponenten im shadcn-Stil **Mira** ("kompakt, für dichte Oberflächen"): mit Maus dicht (Buttons und Felder 28 px, Schrift 12 px).
- **Touch (Handy, Tablet) automatisch größer** über `pointer-coarse`: Buttons und Felder 44 px, Felder mit 16 px Schrift (kein Zoom unter iOS), größere Checkboxen, Radios und Schalter.
- Radius 10 px (`--radius`), Karten mit 1 px Rahmen statt Schatten.
- Fokus immer sichtbar: 2 px Rahmen in `--primary` mit 2 px Abstand.
- Icons: Lucide, Linienstärke Standard, immer mit Text oder `sr-only`-Beschriftung.
- Bewegung nur zur Orientierung, `prefers-reduced-motion` respektieren.

## Sprache

- Deutsch, im Backoffice "Sie".
- Klar und freundlich, Gastro-Begriffe statt Technik ("Gericht", "Abschnitt", "Bestellannahme", nicht "Produkt", "Kategorie", "Sales Channel").
- Keine Gedankenstriche als Satzverbinder, stattdessen Komma, Punkt oder Doppelpunkt.
- Ehrlich über die Reichweite: ShopBite ist ein Bestellsystem, kein Marktplatz.
