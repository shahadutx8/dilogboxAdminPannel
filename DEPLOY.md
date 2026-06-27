# 🚀 Supabase + Render Deployment Guide

## ধাপ ১ — Supabase Database তৈরি করুন

1. **https://supabase.com** এ যান → **Start your project** বা **Sign in**
2. **New Project** বাটনে ক্লিক করুন
3. নাম দিন (যেমন: `dialog-panel`), password দিন, region: **Southeast Asia (Singapore)**
4. **Create new project** — কিছুক্ষণ অপেক্ষা করুন

5. Project তৈরি হলে যান: **Project Settings → Database**
6. নিচে **Connection string** সেকশনে **URI** ট্যাব সিলেক্ট করুন
7. পুরো URL টা কপি করুন — এটাই আপনার `DATABASE_URL`
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxx.supabase.co:5432/postgres
   ```
   > `[YOUR-PASSWORD]` এর জায়গায় আপনার দেওয়া password বসবে

---

## ধাপ ২ — GitHub এ Code Push করুন

1. **https://github.com** এ যান → **New repository** তৈরি করুন
2. নাম দিন: `dialog-admin-panel`, **Private** রাখুন → **Create**

3. আপনার কম্পিউটারে zip extract করুন
4. ওই folder-এ Terminal/CMD খুলুন এবং এই commands দিন:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/dialog-admin-panel.git
   git push -u origin main
   ```

---

## ধাপ ৩ — Render এ Deploy করুন

1. **https://render.com** এ যান → **Sign in with GitHub**
2. **New +** → **Web Service** ক্লিক করুন
3. আপনার `dialog-admin-panel` repo সিলেক্ট করুন → **Connect**

4. Settings:
   - **Name:** `dialog-admin-panel`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** `Free`

5. **Environment Variables** সেকশনে যান → **Add Environment Variable:**

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Supabase থেকে কপি করা URL |
   | `SESSION_SECRET` | যেকোনো random string (যেমন: `abc123xyz789mysecret`) |

6. **Create Web Service** বাটনে ক্লিক করুন

7. Deploy হতে ২-৩ মিনিট লাগবে। শেষ হলে একটা URL পাবেন:
   ```
   https://dialog-admin-panel.onrender.com
   ```

---

## ধাপ ৪ — Panel Access করুন

| Panel | URL |
|-------|-----|
| Super Admin | `https://your-app.onrender.com/api/admin-panel/` |
| App Admin | `https://your-app.onrender.com/panel/APP_API_KEY/` |
| Android Config | `https://your-app.onrender.com/api/dialog/config/APP_API_KEY` |

**Default Login:**
- Username: `admin`
- Password: `admin123`

> ⚠️ প্রথম লগিনের পরেই password পরিবর্তন করুন!

---

## ⚠️ Render Free Tier সম্পর্কে জানুন

- **Web Service:** ১৫ মিনিট কেউ access না করলে "sleep" যায়
- প্রথম request এ ৩০-৬০ সেকেন্ড দেরি হতে পারে (cold start)
- **Supabase Database:** Lifetime free (7 দিন inactive থাকলে pause হয়, কিন্তু data মুছে না)
- Supabase reactivate করতে dashboard এ গিয়ে "Restore" ক্লিক করতে হবে

---

## 🔄 Code Update করলে

GitHub এ push দিলে Render **automatically** নতুন version deploy করবে।
```bash
git add .
git commit -m "Update"
git push
```
