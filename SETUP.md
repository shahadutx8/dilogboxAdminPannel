# Dialog Admin Panel — Setup Guide

  ## Requirements
  - Node.js 18+
  - PostgreSQL database

  ## Quick Start

  ### 1. Dependencies install করুন
  ```bash
  npm install
  ```

  ### 2. .env file তৈরি করুন
  ```bash
  cp .env.example .env
  ```
  তারপর `.env` ফাইল খুলে নিজের PostgreSQL connection string ও secret দিন।

  ### 3. Server চালু করুন
  ```bash
  npm start
  ```

  Server start হলে database table আপনাআপনি তৈরি হয়ে যাবে।

  ## Default Credentials
  - **Username:** admin
  - **Password:** admin123

  ## Endpoints

  | Endpoint | Method | Auth | Description |
  |---|---|---|---|
  | `/api/admin-panel/` | GET | — | Admin panel HTML |
  | `/api/admin/login` | POST | — | Login, returns JWT |
  | `/api/admin/config` | GET | JWT | সব field settings |
  | `/api/admin/config` | PUT | JWT | Settings update |
  | `/api/admin/password` | PUT | JWT | Password change |
  | `/api/dialog/config` | GET | — | Android app config (public) |
  | `/api/healthz` | GET | — | Health check |

  ## Android Smali Config URL
  ```
  https://আপনার-domain.com/api/dialog/config
  ```
  এই URL টা `IPLookupDialog.smali`-এর `CONFIG_URL` field-এ দিন।

  ## Deployment Options

  ### Heroku
  ```bash
  heroku create
  heroku addons:create heroku-postgresql
  heroku config:set SESSION_SECRET=your-secret
  git push heroku main
  ```

  ### Railway / Render
  1. GitHub repo-তে push করুন
  2. New project তৈরি করুন
  3. PostgreSQL database যোগ করুন
  4. Environment variables দিন (DATABASE_URL, SESSION_SECRET)
  5. Start command: `node server.js`
  