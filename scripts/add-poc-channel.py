# Adds a second sales channel "ShopBite Abholung" to a local quickstart Shopware
# (copy of "ShopBite", same menu), so the backoffice channel switch can be tried.
# usage: python3 -I scripts/add-poc-channel.py [http://localhost:8000]
import json, sys, urllib.request

SW = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
NEW_ID = "0190000000007000800000000000b001"


def call(path, body=None, method="POST", tok=None):
    req = urllib.request.Request(SW + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Content-Type": "application/json", "Accept": "application/json",
                                          **({"Authorization": "Bearer " + tok} if tok else {})})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read()
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


_, t = call("/api/oauth/token", {"client_id": "administration", "grant_type": "password", "username": "admin",
                                 "password": "shopbite", "scope": "write"})
tok = t["access_token"]
_, res = call("/api/search/sales-channel", {"filter": [{"type": "equals", "field": "name", "value": "ShopBite"}],
                                            "associations": {"languages": {}, "currencies": {}, "countries": {},
                                                             "paymentMethods": {}, "shippingMethods": {}, "domains": {}}}, tok=tok)
src = res["data"][0]
ids = lambda key: [{"id": x["id"]} for x in src[key]]
dom = src["domains"][0]
_, key = call("/api/_action/access-key/sales-channel", method="GET", tok=tok)
row = {k: src[k] for k in ("typeId", "languageId", "customerGroupId", "currencyId", "paymentMethodId", "shippingMethodId",
                           "countryId", "navigationCategoryId", "footerCategoryId")}
row.update(id=NEW_ID, name="ShopBite Abholung", accessKey=key["accessKey"], active=True,
           languages=ids("languages"), currencies=ids("currencies"), countries=ids("countries"),
           paymentMethods=ids("paymentMethods"), shippingMethods=ids("shippingMethods"),
           domains=[{"url": dom["url"].rstrip("/") + "/abholung", "languageId": dom["languageId"],
                     "currencyId": dom["currencyId"], "snippetSetId": dom["snippetSetId"]}])
s, r = call("/api/_action/sync", [{"key": "channel", "action": "upsert", "entity": "sales_channel", "payload": [row]}], tok=tok)
print("channel", s, r if s >= 300 else NEW_ID)
