# SHOT_LO_PRO Marketing

Admin + processing pipeline for short-form affiliate marketing videos, with a separate public shop front for external traffic.

## Highlights
- Next.js App Router admin dashboard (`/admin`, `/admin-lab`)
- Video intake, processing, upload queue, and logs
- Public shop pages (`/shop`) with UTM logging
- Local JSON storage for shop + ads configuration
- Python helpers for DB and YouTube upload

## Local Run
```bash
cd D:\ai\SHOT_LO_PRO\marketing
npm install
npm run dev
```
Open: `http://localhost:3000`

## AWS Amplify (monorepo)
Repo root is the parent of `marketing/`. The repo root contains `amplify.yml` and the `marketing/` app.

- In Amplify Console: set **App root** (or **Monorepo app path**) to `marketing`, or add env var `AMPLIFY_MONOREPO_APP_ROOT` = `marketing`.
- Build uses `amplify.yml` at repo root (monorepo format with `appRoot: marketing`).

## App Routes
### Admin
- `/admin` legacy dashboard
- `/admin-lab` MVP admin
  - `/admin-lab/videos` raw upload + URL download
  - `/admin-lab/editor` processing + preview + QA toggles
  - `/admin-lab/upload` upload execution
  - `/admin-lab/ads` ads/CTA/partner links
  - `/admin-lab/ads/mall` shop management
  - `/admin-lab/clients` clients CRUD
  - `/admin-lab/logs` failures
  - `/admin-lab/settings` settings (MVP)

### Public Shop
- `/shop` shop list
- `/shop/[mallId]` shop detail

## Storage
- `storage/videos/customer/<customerId>/<videoId>/raw.mp4`
- `storage/videos/processed` upload queue
- `storage/shops/malls.json` shop list + products
- `storage/shops/ads.json` CTA templates + partner links + category images
- `storage/logs/` upload logs + UTM logs

## Key APIs (Next.js)
Admin:
- `POST /api/admin/videos/raw` raw upload
- `POST /api/admin/videos/download` URL download (yt-dlp)
- `POST /api/admin/process/shorts` process + QC
- `POST /api/admin/process/preview` preview frame
- `GET /api/admin/ads/config` ads config JSON
- `GET/POST /api/admin/ads/malls` shop list CRUD
- `PATCH/DELETE /api/admin/ads/malls/[mallId]`
- `POST /api/admin/ads/thumbnail` auto thumbnail (Coupang fallback)
- `POST /api/admin/ads/image-gen` AI image generate
- `POST /api/admin/ai/caption` AI caption
- `GET /api/admin/upload/logs` recent upload logs

Public:
- `POST /api/shop/utm` UTM logging

## Video Processing
Main pipeline:
- `scripts/run-shorts-generator.ts`
  - 9:16 output
  - caption overlay
  - optional watermark remove
  - BGM ducking if `storage/bgm/bgm.mp3` exists

## Python Utilities
- `client_api.py` client CRUD (Postgres)
- `processed_video_api.py` processed video CRUD
- `upload_manager.py` YouTube upload helper
- `youtube_upload_once.py` single upload with strict stdout

## Requirements
- Node.js + npm
- Python 3.11+
- ffmpeg / ffprobe
- yt-dlp (for URL download)

## Notes
- Shop is intended for external traffic; admin is internal only.
- Image auto-fetch from Coupang can be blocked; use category images or AI.
- AI image generation requires `HF_API_TOKEN`.

## Directory Overview (current)
- `app/` Next.js routes + API
- `lib/` Node helpers (upload worker, pipeline)
- `scripts/` CLI utilities
- `python/` YouTube auth/upload helpers
- `storage/` local data + logs
