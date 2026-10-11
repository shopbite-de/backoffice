# Copies the public menu of a live ShopBite shop into a local Shopware, for testing with real data.
#
#   python3 -I scripts/import-from-shop.py [--source URL --key ACCESS_KEY --target URL]
#
# Defaults: Pizzeria La Fattoria (store-api access key is public, it is in the storefront's HTML)
# into the local instance from scripts/compose.lafattoria.yaml on :8100.
#
# Reads ONLY the public Store API of the source (no credentials, nothing is written there).
# Copies the sections under the menu category (with sub-sections), dishes, variants, extras
# (cross-sellings), property groups (ingredients, diet, ...), custom fields and cover images,
# keeping the source ids. No customers, no orders. Dishes the shop does not show (inactive)
# are not visible through the Store API and therefore missing.
# Run it again to update; it upserts.
import argparse, hashlib, json, re, sys, urllib.error, urllib.request, uuid
from concurrent.futures import ThreadPoolExecutor

p = argparse.ArgumentParser()
p.add_argument("--source", default="https://backend.pizzeria-lafattoria.de")
p.add_argument("--key", default="SWSCWK03ELNBQ043VERHB3U3UA")
p.add_argument("--source-menu", default="01a111748de97f25b7ba75dab27fb7aa", help="menu category id of the source shop")
p.add_argument("--target", default="http://localhost:8100")
p.add_argument("--user", default="admin")
p.add_argument("--password", default="shopbite")
args = p.parse_args()

EUR = "b7d2554b0ce847cd82f3ac9bd1c0dfca"  # Shopware's default currency id


def pair_id(*ids):
    """Stable id for a mapping row (source ids are time based, so prefixes repeat)."""
    return hashlib.md5(":".join(ids).encode()).hexdigest()


def http(url, body=None, method="POST", headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Content-Type": "application/json", "Accept": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            t = r.read()
            return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {url}: {e.code} {e.read()[:600]!r}")


# ---------------------------------------------------------------- source (Store API, read only)
def store(path, body):
    return http(f"{args.source.rstrip('/')}/store-api{path}", body, headers={"sw-access-key": args.key})


def store_all(path, body):
    out, page = [], 1
    while True:
        res = store(path, {**body, "limit": 100, "page": page, "total-count-mode": "exact"})
        out += res["elements"]
        if len(out) >= res["total"] or not res["elements"]:
            return out
        page += 1


print("lese Abschnitte …")
categories = store_all("/category", {})
by_id = {c["id"]: c for c in categories}
def under_menu(c):
    while c and c.get("parentId"):
        if c["parentId"] == args.source_menu:
            return True
        c = by_id.get(c["parentId"])
    return False
sections = [c for c in categories if under_menu(c) and c["type"] == "page"]
print(f"  {len(sections)} Abschnitte und Unterabschnitte")

print("lese Gerichte …")
products = store_all("/product", {"associations": {
    "properties": {"associations": {"group": {}}},
    "options": {"associations": {"group": {}}},
    "cover": {},
}})
parents = [x for x in products if not x.get("parentId")]
print(f"  {len(products)} Produkte, davon {len(parents)} Hauptprodukte")

# the listing does not always report childCount, so variants are recognised by their children
with_children = {x["parentId"] for x in products if x.get("parentId")}
def detail(prod):
    pid = prod["id"]
    d = store(f"/product/{pid}", {}) if pid in with_children else None
    xs = store(f"/product/{pid}/cross-selling", {})
    return pid, d, xs
with ThreadPoolExecutor(6) as pool:
    details = {pid: (d, xs) for pid, d, xs in pool.map(detail, parents)}
print("  Varianten und Extras gelesen")

# ---------------------------------------------------------------- target (Admin API)
TARGET = args.target.rstrip("/")
token = http(f"{TARGET}/api/oauth/token", {"grant_type": "password", "client_id": "administration", "scope": "write",
                                            "username": args.user, "password": args.password})["access_token"]
def admin(path, body=None, method="POST"):
    return http(f"{TARGET}/api{path}", body, method, {"Authorization": f"Bearer {token}"})
def search(entity, criteria):
    return admin(f"/search/{entity}", criteria)["data"]
def sync(ops):
    ops = [o for o in ops if o["payload"]]
    if ops:
        admin("/_action/sync", ops)

# the "ShopBite" sales channel of the quickstart setup (fixed id, see shopbite/setup/setup.py)
QUICKSTART_NS = uuid.UUID("0b5f0c1e-7a4d-4c3b-9e8f-5d6a7b8c9d0e")
channel = search("sales-channel", {"ids": [uuid.uuid5(QUICKSTART_NS, "sales-channel").hex]})[0]
# the menu category of the quickstart setup (same id as in its storefront config); created when the demo menu was skipped
QUICKSTART_MENU = uuid.uuid5(QUICKSTART_NS, "category:speisekarte").hex
found = search("category", {"filter": [{"type": "equals", "field": "name", "value": "Speisekarte"},
                                       {"type": "equals", "field": "parentId", "value": channel["navigationCategoryId"]}]})
local_menu = found[0]["id"] if found else QUICKSTART_MENU
if not found:
    sync([{"key": "menu", "action": "upsert", "entity": "category", "payload": [
        {"id": local_menu, "parentId": channel["navigationCategoryId"], "name": "Speisekarte", "type": "page",
         "active": True, "visible": True, "customFields": by_id.get(args.source_menu, {}).get("customFields")}]}])
taxes = {round(t["taxRate"], 2): t["id"] for t in search("tax", {})}
folder = search("media-default-folder", {"filter": [{"type": "equals", "field": "entity", "value": "product"}],
                                         "associations": {"folder": {}}})[0]["folder"]["id"]
print(f"Ziel: Sales Channel {channel['name']}, Speisekarte {local_menu}")

# property groups and options, collected from the dishes
groups = {}
for prod in products:
    for o in (prod.get("properties") or []) + (prod.get("options") or []):
        g = o["group"]
        entry = groups.setdefault(g["id"], {"id": g["id"], "name": g["translated"]["name"] or g["name"],
                                            "displayType": g.get("displayType") or "text",
                                            "sortingType": g.get("sortingType") or "position",
                                            "filterable": bool(g.get("filterable")),
                                            "visibleOnProductDetailPage": g.get("visibleOnProductDetailPage", True),
                                            "position": g.get("position") or 1, "options": {}})
        entry["options"][o["id"]] = {"id": o["id"], "name": o["translated"]["name"] or o["name"],
                                     "position": o.get("position") or 1, "customFields": o.get("customFields")}
sync([{"key": "groups", "action": "upsert", "entity": "property_group",
       "payload": [{**g, "options": list(g["options"].values())} for g in groups.values()]}])
print(f"  {len(groups)} Eigenschaftsgruppen")

# sections: direct children of the source menu go under the local menu; order (afterCategoryId) in a second pass
def category_payload(c, with_order):
    row = {"id": c["id"], "parentId": local_menu if c["parentId"] == args.source_menu else c["parentId"],
           "name": c["translated"]["name"], "active": c.get("active", True), "visible": c.get("visible", True),
           "type": "page", "displayNestedProducts": c.get("displayNestedProducts", True),
           "productAssignmentType": "product", "customFields": c.get("customFields"),
           "metaTitle": c["translated"].get("metaTitle"), "metaDescription": c["translated"].get("metaDescription"),
           "description": c["translated"].get("description")}
    if with_order:
        row = {"id": c["id"], "afterCategoryId": c.get("afterCategoryId")}
    return row
ordered = sorted(sections, key=lambda c: c["level"])
sync([{"key": "sections", "action": "upsert", "entity": "category", "payload": [category_payload(c, False) for c in ordered]}])
sync([{"key": "order", "action": "upsert", "entity": "category", "payload": [category_payload(c, True) for c in ordered]}])
print(f"  {len(sections)} Abschnitte angelegt")

# cover images: media entity with the source id, file fetched by Shopware from the public URL
covers = {}
for prod in products:
    cover = prod.get("cover")
    if cover and cover.get("media") and cover["media"].get("url"):
        covers[cover["media"]["id"]] = cover["media"]
existing = {m["id"] for m in search("media", {"ids": list(covers), "filter": [
    {"type": "not", "queries": [{"type": "equals", "field": "fileName", "value": None}]}]})} if covers else set()
sync([{"key": "media", "action": "upsert", "entity": "media",
       "payload": [{"id": mid, "mediaFolderId": folder, "alt": m.get("alt")} for mid, m in covers.items()]}])
def upload(item):
    mid, m = item
    if mid in existing:
        return 0
    ext = (m.get("fileExtension") or re.sub(r".*\.", "", m["url"].split("?")[0])).lower()
    name = re.sub(r"[^A-Za-z0-9_-]", "-", m.get("fileName") or mid) + "-" + mid[:6]
    admin(f"/_action/media/{mid}/upload?extension={ext}&fileName={name}", {"url": m["url"]})
    return 1
with ThreadPoolExecutor(4) as pool:
    uploaded = sum(pool.map(upload, covers.items()))
print(f"  {len(covers)} Bilder ({uploaded} neu hochgeladen)")

# dishes
section_ids = {c["id"] for c in sections}
def gross(prod):
    return round(prod["calculatedPrice"]["unitPrice"], 2)
def tax_rate(prod):
    taxes_ = prod["calculatedPrice"].get("calculatedTaxes") or []
    return round(taxes_[0]["taxRate"] if taxes_ else prod["tax"]["taxRate"], 2)
def price(amount, rate):
    return [{"currencyId": EUR, "gross": amount, "net": round(amount / (1 + rate / 100), 4), "linked": True}]
def product_payload(prod):
    rate = tax_rate(prod)
    t = prod["translated"]
    row = {
        "id": prod["id"], "productNumber": prod["productNumber"], "stock": prod.get("stock") or 999,
        "active": True, "taxId": taxes[rate], "price": price(gross(prod), rate),
        "name": t.get("name"), "description": t.get("description"),
        "metaTitle": t.get("metaTitle"), "metaDescription": t.get("metaDescription"), "keywords": t.get("keywords"),
        "customSearchKeywords": t.get("customSearchKeywords"),
        "customFields": prod.get("customFields"),
        "markAsTopseller": prod.get("markAsTopseller", False),
        "minPurchase": prod.get("minPurchase") or 1, "purchaseSteps": prod.get("purchaseSteps") or 1,
        "shippingFree": prod.get("shippingFree", False),
        "width": prod.get("width"), "height": prod.get("height"), "length": prod.get("length"), "weight": prod.get("weight"),
        "categories": [{"id": c} for c in prod.get("categoryIds") or [] if c in section_ids],
        "properties": [{"id": o["id"]} for o in prod.get("properties") or []],
        "visibilities": [{"id": pair_id(prod["id"], channel["id"]), "salesChannelId": channel["id"], "visibility": 30}],
    }
    cover = prod.get("cover")
    if cover and cover.get("media", {}).get("id") in covers:
        row["media"] = [{"id": cover["id"], "mediaId": cover["media"]["id"], "position": 0}]
        row["coverId"] = cover["id"]
    return row

parent_rows = []
for prod in parents:
    row = product_payload(prod)
    d, _ = details[prod["id"]]
    if d and d.get("configurator"):
        row["configuratorSettings"] = [{"id": pair_id(prod["id"], o["id"]), "optionId": o["id"]}
                                       for g in d["configurator"] for o in g.get("options") or []]
        row["variantListingConfig"] = {"displayParent": True}
    parent_rows.append(row)
by_parent_price = {x["id"]: gross(x) for x in parents}
child_rows = []
for prod in products:
    if not prod.get("parentId"):
        continue
    row = product_payload(prod)
    row["parentId"] = prod["parentId"]
    row["options"] = [{"id": o["id"]} for o in prod.get("options") or []]
    for key in ("categories", "properties", "visibilities", "customFields", "name", "description", "media", "coverId"):
        row.pop(key, None)  # inherited from the dish
    if gross(prod) == by_parent_price.get(prod["parentId"]):
        row["price"] = None
    child_rows.append(row)
sync([{"key": "dishes", "action": "upsert", "entity": "product", "payload": parent_rows},
      {"key": "variants", "action": "upsert", "entity": "product", "payload": child_rows}])
print(f"  {len(parent_rows)} Gerichte, {len(child_rows)} Varianten")

# extras (cross-sellings); the backoffice edits fixed product lists
known = {x["id"] for x in products}
rows, streams = [], 0
for pid, (_, xs) in details.items():
    for pos, x in enumerate(xs or []):
        cs = x["crossSelling"]
        # a product stream is resolved by the Store API; it becomes a fixed list with today's products
        streams += cs.get("type") == "productStream"
        rows.append({"id": cs["id"], "productId": pid, "name": cs["translated"]["name"] or cs["name"], "type": "productList",
                     "active": True, "position": cs.get("position", pos), "sortBy": cs.get("sortBy") or "name",
                     "sortDirection": cs.get("sortDirection") or "ASC", "limit": cs.get("limit") or 24,
                     "assignedProducts": [{"id": pair_id(cs["id"], e["id"]), "productId": e["id"], "position": i}
                                          for i, e in enumerate(x.get("products") or []) if e["id"] in known]})
sync([{"key": "extras", "action": "upsert", "entity": "product_cross_selling", "payload": rows}])
print(f"  {len(rows)} Extras-Listen" + (f", davon {streams} aus Product Streams als feste Liste übernommen" if streams else ""))
print(f"fertig. Menü-Kategorie für NUXT_SALES_CHANNELS: {channel['id']}:{local_menu}")
