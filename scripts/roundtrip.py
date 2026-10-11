# Round trip over the whole menu: every dish is loaded in the backoffice and saved unchanged;
# the Shopware state before and after must be identical (product and variants with prices, texts,
# custom fields, properties, sections, tags, extras, configurator). Needs a running backoffice and
# its Shopware, ideally the real menu (README, "Mit echten Daten testen"). Writes to that Shopware!
#
#   python3 -I scripts/roundtrip.py [--backoffice http://localhost:3010] [--shopware http://localhost:8100]
#                                   [--user chef --password chef-poc-1234] [--admin admin --admin-password shopbite]
import argparse
import json, urllib.request, http.cookiejar, sys
p = argparse.ArgumentParser()
p.add_argument("--backoffice", default="http://localhost:3010")
p.add_argument("--shopware", default="http://localhost:8100")
p.add_argument("--user", default="chef")
p.add_argument("--password", default="chef-poc-1234")
p.add_argument("--admin", default="admin")
p.add_argument("--admin-password", default="shopbite")
args = p.parse_args()
B = args.backoffice.rstrip("/"); SW = args.shopware.rstrip("/")
cj=http.cookiejar.CookieJar(); op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def call(url, body=None, method=None, headers=None):
    r=urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method or ("POST" if body is not None else "GET"), headers={"content-type":"application/json","accept":"application/json",**(headers or {})})
    try:
        with op.open(r) as x: return json.loads(x.read() or b"null")
    except urllib.error.HTTPError as e: return {"error": e.code, "msg": e.read()[:300].decode()}
call(B+"/api/auth/login", {"username":args.user,"password":args.password})
tok=call(SW+"/api/oauth/token",{"grant_type":"password","client_id":"administration","scope":"write","username":args.admin,"password":args.admin_password})["access_token"]
H={"Authorization":"Bearer "+tok}
def snap(pid):
    d=call(SW+"/api/search/product",{"filter":[{"type":"multi","operator":"or","queries":[{"type":"equals","field":"id","value":pid},{"type":"equals","field":"parentId","value":pid}]}],"associations":{"options":{},"properties":{},"categories":{},"tags":{},"crossSellings":{"associations":{"assignedProducts":{}}},"configuratorSettings":{}},"sort":[{"field":"productNumber"}]},headers=H)["data"]
    keys=("productNumber","name","description","price","active","customFields","metaTitle","metaDescription","keywords","width","height","length","weight","customSearchKeywords","parentId")
    return [{**{k:p.get(k) for k in keys},"opts":sorted(o["id"] for o in p.get("options") or []),"props":sorted(o["id"] for o in p.get("properties") or []),"cats":sorted(c["id"] for c in p.get("categories") or []),"tags":sorted(t["id"] for t in p.get("tags") or []),
             "xs":sorted((x["name"],x["type"],tuple(sorted(a["productId"] for a in x.get("assignedProducts") or []))) for x in p.get("crossSellings") or []),"cfg":sorted(c["optionId"] for c in p.get("configuratorSettings") or [])} for p in d]
menu=call(B+"/api/menu"); dishes=[d for s in menu for d in s["dishes"]]
bad=0
for d in dishes:
    a=snap(d["id"]); dd=call(B+f"/api/dishes/{d['id']}")
    if "error" in dd: print("LADEN", d["number"], d["name"], dd); bad+=1; continue
    body={k:v for k,v in dd.items() if k not in ("id","number","taxRate")}
    r=call(B+f"/api/dishes/{d['id']}", body, "PUT")
    if "error" in r: print("SPEICHERN", d["number"], d["name"], r); bad+=1; continue
    b=snap(d["id"])
    if a!=b or r!=dd:
        bad+=1; print("ABWEICHUNG", d["number"], d["name"])
        for x,y in zip(a,b):
            if x!=y: print("   ", x["productNumber"], {k:(x[k],y[k]) for k in x if x[k]!=y[k]})
        if len(a)!=len(b): print("    Anzahl", len(a), len(b))
        if r!=dd: print("    Editor:", [k for k in dd if dd[k]!=r.get(k)])
print(f"{len(dishes)} Gerichte geprüft, {bad} mit Problemen")
sys.exit(1 if bad else 0)
