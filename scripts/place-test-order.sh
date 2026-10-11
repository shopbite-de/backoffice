#!/bin/bash
# usage: scripts/place-test-order.sh <product number>  (quickstart stack, access key from /config/storefront.env)
# places a guest order on the local quickstart shop
KEY=${SW_ACCESS_KEY:?set SW_ACCESS_KEY}; S=http://localhost:8000/store-api; H='content-type: application/json'
CTX=$(curl -s -D - -o /dev/null -H "sw-access-key: $KEY" $S/context | grep -i '^sw-context-token' | awk '{print $2}' | tr -d '\r')
h() { curl -s -H "sw-access-key: $KEY" -H "sw-context-token: $CTX" -H "$H" -X POST "$@"; }
PID=$(h -d "{\"filter\":[{\"type\":\"equals\",\"field\":\"productNumber\",\"value\":\"$1\"}],\"includes\":{\"product\":[\"id\"]}}" $S/product | python3 -c "import json,sys;print(json.load(sys.stdin)['elements'][0]['id'])")
SAL=$(h $S/salutation | python3 -c "import json,sys;print(json.load(sys.stdin)['elements'][0]['id'])")
h -d "{\"items\":[{\"type\":\"product\",\"referencedId\":\"$PID\",\"quantity\":2}]}" $S/checkout/cart/line-item -o /dev/null
R=$(h -D /tmp/sb-order-hdr.txt -d "{\"guest\":true,\"storefrontUrl\":\"http://localhost:3000\",\"salutationId\":\"$SAL\",\"firstName\":\"Test\",\"lastName\":\"Gast\",\"email\":\"test@example.com\",\"acceptedDataProtection\":true,\"billingAddress\":{\"street\":\"Musterweg 1\",\"zipcode\":\"12345\",\"city\":\"Musterstadt\",\"countryId\":\"01a0f3abbcec734f8d9c630dbe7e73ae\"}}" $S/account/register)
echo "$R" | grep -o '"detail":"[^"]*"' | head -3
N=$(grep -i '^sw-context-token' /tmp/sb-order-hdr.txt | awk '{print $2}' | tr -d '\r'); [ -n "$N" ] && CTX=$N
h -d '{"customerComment":"Wunschzeit: 19:30"}' $S/checkout/order | python3 -c "import json,sys;d=json.load(sys.stdin);print('order', d.get('orderNumber') or d)"
