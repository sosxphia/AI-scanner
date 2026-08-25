# PRD — DETECT·AI (AI Photo Scanner)

## Original Problem Statement
Build a mobile app: an AI scanner where you upload a photo and it tells you whether it's real or AI with a confidence %. App opens like the camera app; on the left there's a profile tab, a history tab, a help tab, and a subscription tab.

## User Choices
- Detection model: Claude Sonnet 4.6 (Emergent Universal Key)
- Subscriptions: Emergent-managed RevenueCat (real in-app subscriptions)
- Auth: Emergent-managed Google login
- Free scans: unlimited (no scan limit)

## Architecture
- Frontend: Expo (SDK 54) + expo-router, dark-first utility design (Obsidian #0D0D0D / Ember #FF4D00), Archivo + IBM Plex Mono fonts
- Backend: FastAPI + MongoDB (motor), port 8001, /api prefix
- AI: emergentintegrations LlmChat → anthropic/claude-sonnet-4-6 vision, strict JSON verdict {verdict, confidence, summary, indicators}
- Images: Emergent Object Storage (path: ai-photo-judge/uploads/{user_id}/{uuid}.ext), served via GET /api/files/{path}?token=
- Auth: Emergent Google OAuth → POST /api/auth/session → 7-day Bearer session_token (secure store on mobile, localStorage on web)
- Payments: RevenueCat — entitlement "pro", offering "default", $rc_monthly $9.99 / $rc_annual $79.99; Test Store in preview/Expo Go; client-side entitlement gating only. See /app/memory/revenuecat.md

## Implemented (2026-06)
- Camera-first home: full-bleed expo-camera, frosted left vertical rail (Profile / History / Help / Pro), shutter, flip, gallery upload, permission flow per contract
- Scan result screen: laser scanning animation, verdict + confidence % (orange AI / green REAL), glass indicators card, haptics, retry/error state
- History (Scan Log): auth-gated dense list with thumbnails from object storage, pull-to-refresh, empty "LOG EMPTY_" state
- Profile: Google sign-in, avatar/name/email, PRO/FREE status, quick links, logout
- Help: FAQ (how it works, accuracy, privacy)
- Subscription: coded paywall from RevenueCat offerings, monthly/annual cards, confirm modal, restore purchases, identity gating (Purchases.logIn with backend user_id), simulated Test Store note
- Backend endpoints: POST /api/auth/session, GET /api/auth/me, POST /api/auth/logout, POST /api/scan (anonymous or authed), GET /api/scans, GET /api/scans/stats, GET /api/files/{path}
- Testing: 14/14 backend pytest passed; all frontend flows verified (iteration 1)

## User Personas
- Casual user: quickly checks if a viral image is AI
- Power user (Pro): frequent verification, wants history sync

## Backlog / Next
- P1: batch scanning, scan detail view from history, delete history entries
- P1: Pro-gated features (e.g., detailed forensic report) once user defines Pro perks
- P2: share result cards, onboarding, scan stats dashboard (uses /api/scans/stats)
- Store-side: user must configure App Store / Play products + credentials for real purchases (FAQ in payments panel)
