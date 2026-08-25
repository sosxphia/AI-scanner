# RevenueCat — integrated (2026-06)
This file is supposed to serve as a memory to you if you have to interact with user's RevenueCat account via integration proxy at any later point in time.

## Identifiers (from /setup response — copy verbatim)
- rc_project_id: proj998344bb
- apple_app_id: appac5c17957d
- play_app_id: app6353af6191
- entitlement_lookup_key: pro
- offering_lookup_key: default
- Packages (package -> product_id, current price):
  - $rc_monthly -> prodf9e8c9bac5   ($9.99 / P1M, trial: none)
  - $rc_annual  -> prod4368c7147d   ($79.99 / P1Y, trial: none)
- Dashboard: https://app.revenuecat.com/projects/proj998344bb

## Check for project_state in revenuecat status api response. if the project_state is less then project_created, re-fetch RevenueCat playbook via the integration expert tool.
Status check:
`curl -sS -H "$AUTH" "$INTEGRATION_PROXY_URL/internal/revenuecat/projects/5d52e126-f33f-44e2-a1b5-9f4efcfcc934/status"`
→ `{"connection_state":"connected","project_state":"...","rc_project_id":"..."}`

## Later updates to user's products (integration proxy apis ONLY — NEVER call the RevenueCat REST API)
- Change price/duration/trial OR add a package (upsert):
  POST $INTEGRATION_PROXY_URL/internal/revenuecat/projects/5d52e126-f33f-44e2-a1b5-9f4efcfcc934/products
  body: {"products":[{"package":"$rc_monthly","price":14.99,"currency":"USD",
         "period":"P1M","trial":"P1W",
         "prices":[{"amount_micros":14990000,"currency":"USD"}]}]}
  (amount_micros = price × 1,000,000; omit "trial" for none)
- Remove a package:
  DELETE $INTEGRATION_PROXY_URL/internal/revenuecat/projects/5d52e126-f33f-44e2-a1b5-9f4efcfcc934/products/%24rc_monthly
  ($ -> %24)
- Recover identifiers / repopulate .env: re-run the idempotent /setup call.

## Taking in-app purchases LIVE — store-side steps (USER does these — agent cannot verify or perform)
Needed ONLY for REAL purchases in published store builds. Test Store
(Expo Go / web preview / dev build) needs none of this.

- Step 1 — Upload App Store / Play Store credentials to the RevenueCat dashboard
  (Home → project → Apps → App name)
  - iOS: In-app purchase key + App Store Connect API key
  - Android: Google Play service-account credentials JSON
- Step 2 — Set up payment profiles in App Store Connect and Play Console
- Step 3 — Create matching in-app purchase products with the SAME product IDs shown in RevenueCat dashboard
- Step 4 — Release build, test with TestFlight / Play internal testing, submit for review.

All the steps needed to integrate RevenueCat in their production app are present in FAQ section of payments panel.
