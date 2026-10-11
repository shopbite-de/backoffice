# Creates the two backoffice roles and three test users on a local quickstart Shopware:
#   chef / chef-poc-1234          Management, all branches
#   theke / theke-poc-1234        Personal, branch "ShopBite"
#   abholung / abholung-poc-1234  Personal, branch "ShopBite Abholung" (scripts/add-poc-channel.py)
# usage: python3 -I scripts/create-poc-users.py [http://localhost:8000]
# Roles and users need a token with the "user-verified" scope (OAuth parameter "scope", not "scopes").
# Later the plugin does this (role installer + CLI), see docs/plan.md phase 1.
import json, os, sys, urllib.request

SW = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
BRANCH_FIELD = "shopbite_sales_channel_ids"

def call(path, body=None, method="POST", tok=None):
    req = urllib.request.Request(SW + path, data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json", **({"Authorization": "Bearer " + tok} if tok else {})})
    try:
        with urllib.request.urlopen(req) as r:
            t = r.read(); return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")

def upsert(entity, payload, tok):
    s, r = call(f"/api/{entity}", payload, tok=tok)
    if s == 400:  # exists: update instead
        body = {k: v for k, v in payload.items() if k != "id"}
        s, r = call(f"/api/{entity}/{payload['id']}", body, method="PATCH", tok=tok)
    print(entity, payload.get("name") or payload.get("username"), s, r if s >= 300 else "")

_, t = call("/api/oauth/token", {"client_id": "administration", "grant_type": "password", "username": "admin", "password": "shopbite", "scope": "write user-verified"})
tok = t["access_token"]
privileges = lambda name: json.load(open(os.path.join(HERE, f"../docs/notes/{name}-privileges.json")))
_, loc = call("/api/search/locale", {"filter": [{"type": "equals", "field": "code", "value": "de-DE"}]}, tok=tok)
locale = loc["data"][0]["id"]

MANAGEMENT = "0190000000007000800000000000a001"
PERSONAL = "0190000000007000800000000000a003"
upsert("acl-role", {"id": MANAGEMENT, "name": "ShopBite Management", "privileges": privileges("management")}, tok)
upsert("acl-role", {"id": PERSONAL, "name": "ShopBite Personal", "privileges": privileges("personal")}, tok)

USERS = [
    ("0190000000007000800000000000a002", "chef", "Clara", "Chef", MANAGEMENT, None),
    ("0190000000007000800000000000a004", "theke", "Tom", "Theke", PERSONAL, ["bfc388d793ea531389938731b8ca21da"]),
    ("0190000000007000800000000000a005", "abholung", "Alex", "Abholung", PERSONAL, ["0190000000007000800000000000b001"]),
]
for uid, username, first, last, role, branches in USERS:
    upsert("user", {
        "id": uid, "localeId": locale, "username": username, "password": f"{username}-poc-1234",
        "firstName": first, "lastName": last, "email": f"{username}@example.com",
        "aclRoles": [{"id": role}],
        "customFields": {BRANCH_FIELD: branches} if branches else None,
    }, tok)
    # a user keeps old roles on PATCH; drop the other one
    other = PERSONAL if role == MANAGEMENT else MANAGEMENT
    call(f"/api/user/{uid}/acl-roles/{other}", method="DELETE", tok=tok)
