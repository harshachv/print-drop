# Prdrop

A minimalist file drop for printing.

**Live: https://prdrop.vercel.app**

Drop a document, open it from any browser at any printer, hit print. Files clear themselves after 24 hours so you don't accumulate clutter.

---

## Why this exists

Walking up to a shared printer with a document on your laptop is awkward. AirPrint is finicky across networks, and emailing yourself a file just to download it on another machine adds friction.

Prdrop is a one-page web app: drop a file, open the URL on the device connected to the printer, click **Print**. That's it. No accounts, no install, no setup.

---

## Features

| Feature | Detail |
|---|---|
| **Upload** | Drag & drop or click to browse. PDF, image, or document up to 500 MB total. |
| **Print** | Opens the file in a new browser tab — Cmd/Ctrl+P prints it. |
| **Download** | Saves the file to local disk with its original name. |
| **Delete** | One-click removal. |
| **Auto-expire** | Files older than 24 hours are automatically deleted on the next page load. |
| **Storage indicator** | Live progress bar showing usage out of the 500 MB cap. |
| **Filename safety** | Special characters and spaces are sanitized before upload (Supabase rejects them). |

---

## How to use

1. Open **https://prdrop.vercel.app** on your laptop
2. Drop a file onto the upload zone (or click to browse)
3. Wait for upload to complete — it appears in the file list
4. On the device connected to the printer, open the same URL
5. Click **Print** next to the file → browser opens it → Cmd/Ctrl+P
6. When done, click the trash icon to delete (or wait 24h for auto-cleanup)

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Static export, zero-config deploy, React 19 |
| **Styling** | Tailwind CSS v4 | Inline utility classes, no separate CSS files |
| **Storage** | Supabase Storage | 1 GB free tier, no credit card required |
| **Hosting** | Vercel | Free tier, auto-deploy on git push |
| **Language** | TypeScript | |
| **Icons** | Inline SVG (Lucide-style) | No icon library dependency |

The entire frontend is a single client component (`app/page.tsx`) with a thin Supabase wrapper (`lib/supabase.ts`). No API routes, no backend code — Supabase handles everything storage-related directly from the browser.

---

## Architecture

```
┌──────────────────┐         ┌──────────────────┐
│  prdrop.vercel.  │         │   Supabase       │
│  app             │ ──────▶ │   Storage        │
│  (Next.js SSG)   │         │  (print-files    │
│                  │         │   public bucket) │
└──────────────────┘         └──────────────────┘
        ▲                            ▲
        │                            │
   user browser                user browser
   (page render)              (direct upload/download)
```

- The Next.js page is fully static — Vercel serves it from edge cache.
- All file operations (upload, list, delete, public URL) go directly from the user's browser to Supabase Storage using the anon public key.
- Row Level Security policies on `storage.objects` allow public CRUD scoped to the `print-files` bucket only.

---

## Local development

```bash
# 1. Clone
git clone https://github.com/harshachv/print-drop.git
cd print-drop

# 2. Install
npm install

# 3. Configure environment
cp .env.local.example .env.local
# Edit .env.local with your Supabase URL + anon key

# 4. Run dev server
npm run dev
# → http://localhost:3000
```

### Required environment variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-public-key>
```

Find both in Supabase → **Project Settings** → **API**.

---

## Setting up your own Supabase backend

1. **Create a project** at [supabase.com](https://supabase.com) — sign in with GitHub, no card required.

2. **Create a public bucket** named `print-files`:
   - Storage → New bucket → name: `print-files` → toggle **Public bucket: ON**

3. **Add RLS policies** — paste in Supabase SQL Editor:

   ```sql
   CREATE POLICY "public upload" ON storage.objects
     FOR INSERT TO anon
     WITH CHECK (bucket_id = 'print-files');

   CREATE POLICY "public read" ON storage.objects
     FOR SELECT TO anon
     USING (bucket_id = 'print-files');

   CREATE POLICY "public delete" ON storage.objects
     FOR DELETE TO anon
     USING (bucket_id = 'print-files');
   ```

4. **Copy `Project URL` and `anon public` key** from Project Settings → API.

---

## Deployment

This app is deployed on **Vercel** with auto-deploy on every push to `main`.

```bash
# First-time deployment
npx vercel
# Add env vars in Vercel dashboard or CLI:
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
npx vercel --prod
```

The custom domain alias was set with:
```bash
npx vercel alias set <deployment-url> prdrop.vercel.app
```

---

## Project structure

```
print-drop/
├── app/
│   ├── globals.css      # Tailwind imports + font setup
│   ├── layout.tsx       # Root layout, Geist font, metadata
│   └── page.tsx         # Single-page app (upload zone, file list, all logic)
├── lib/
│   └── supabase.ts      # Lazy Supabase client singleton
├── public/              # Static assets
├── .env.local.example   # Template for environment variables
├── storage.rules        # Reference RLS policies (Supabase SQL)
└── next.config.ts
```

---

## Privacy & security caveats

This app has **no authentication**. Anyone with the URL can upload, view, and delete files. Suitable for personal use and small trusted groups; **not** suitable for confidential documents.

- Files are publicly readable via direct URL once uploaded.
- The Supabase anon key is exposed in the client bundle (this is by design — it's the public key).
- The 500 MB cap is enforced client-side only. A motivated user could bypass it.

If you need privacy: add Supabase Auth, change the bucket to private, and require sign-in before list/upload/delete.

---

## Design notes

- **Palette:** warm neutrals (`stone-50` through `stone-900`) instead of cool grays. Black accent for primary action.
- **Typography:** Geist (Vercel's geometric sans), tight tracking, tabular numerals for sizes and percentages.
- **Icons:** inline SVG, 1.6–1.8 stroke width, Lucide-style.
- **Microinteractions:** action buttons reveal on row hover (60% → 100% opacity); upload zone fills black when dragging.

---

## License

MIT — do whatever you want with this.
