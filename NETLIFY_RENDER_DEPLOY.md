# Netlify + Render Deployment Guide

## আর্কিটেকচার

```
Android App / Browser
        ↓
  [Netlify] ← সব URL এখানে FIXED (Admin + API দুটোই)
   /api/admin-panel/     → admin panel HTML
   /panel/*              → app-panel HTML
   /api/dialog/config/*  → Render-এ proxy (Android API)
   /api/admin/*          → Render-এ proxy (Admin API)
   বাকি সব /api/*       → Render-এ proxy
        ↓
  [Render] ← শুধু backend কাজ করে (বদলানো যাবে)
```

---

## আপনার সব Fixed URL (Netlify-এর মাধ্যমে)

Netlify deploy হওয়ার পর এই URL গুলো **কখনো বদলাবে না:**

| কী                     | URL                                                        |
|------------------------|------------------------------------------------------------|
| Super Admin Panel      | `https://your-site.netlify.app/api/admin-panel/`           |
| App Panel              | `https://your-site.netlify.app/panel/YOUR_API_KEY/`        |
| Public View            | `https://your-site.netlify.app/view/YOUR_API_KEY/`         |
| **Android API (Fixed)**| `https://your-site.netlify.app/api/dialog/config/API_KEY`  |

> **Android app-এ Render URL দেবেন না।** সবসময় Netlify URL দিন।
> Render বদলালেও Netlify URL একই থাকে।

---

## Step 1: GitHub-এ Push করুন

এই project-টা GitHub-এ push করুন (যদি না থাকে)।

---

## Step 2: Render-এ Deploy করুন (Backend)

1. [render.com](https://render.com) → New → Web Service
2. GitHub repo connect করুন
3. এই settings দিন:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Environment Variables এ দিন:
   - `DATABASE_URL` → আপনার PostgreSQL connection string
   - `SESSION_SECRET` → যেকোনো random string (যেমন: `my-super-secret-123`)
5. Deploy করুন
6. Deploy হলে URL পাবেন — যেমন: `https://dialog-admin-backend.onrender.com`

> এই Render URL টা কপি করে রাখুন — Netlify-তে দরকার হবে।

---

## Step 3: Netlify-তে Deploy করুন (Frontend + Proxy)

1. [netlify.com](https://netlify.com) → New site → Import from GitHub
2. একই GitHub repo select করুন
3. Build settings:
   - **Publish directory:** `public`
   - Build command: (খালি রাখুন)
4. **Deploy করার আগে** Environment Variables সেট করুন:
   - Site configuration → Environment variables → Add variable
   - **Key:** `RENDER_URL`
   - **Value:** `https://dialog-admin-backend.onrender.com` (Step 2 থেকে পাওয়া URL)
5. Deploy করুন

---

## Render Account বদলালে কী করবেন?

শুধু **2টা কাজ** করতে হবে:

1. নতুন Render account-এ deploy করুন → নতুন Render URL পাবেন
2. Netlify dashboard → Site configuration → Environment variables → `RENDER_URL` আপডেট করুন

**ব্যস! Admin URL ও Android API URL দুটোই একই থাকবে।** কোনো code change বা APK rebuild লাগবে না।

---

## Database সম্পর্কে (গুরুত্বপূর্ণ)

Render বদলালে database-ও যায়। Data ধরে রাখতে আলাদা free PostgreSQL ব্যবহার করুন:

- [Neon](https://neon.tech) — free PostgreSQL (সবচেয়ে ভালো)
- [Supabase](https://supabase.com) — free PostgreSQL (500MB)

এগুলোর `DATABASE_URL` Render-এ দিলে Render বদলালেও **সব data থাকবে।**
