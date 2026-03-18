# NovaCare — Complete ENV Setup Guide
> Do this ONCE before running anything. All APIs are FREE. No credit card needed except Railway.

---

## ⏱️ Total Time: ~25 minutes

| Service | Time | Credit Card? | Link |
|---------|------|-------------|------|
| Supabase | 5 min | ❌ No | supabase.com |
| Groq | 3 min | ❌ No | console.groq.com |
| OpenRouter | 3 min | ❌ No | openrouter.ai |
| Google AI Studio | 3 min | ❌ No | aistudio.google.com |
| Expo | 3 min | ❌ No | expo.dev |
| Railway | 5 min | ✅ Yes (free $5 credit) | railway.app |

---

## STEP 1 — Supabase (Database + Auth + Storage)
**Go to: https://supabase.com → Sign Up (free)**

1. Create new project → name it `novacare`
2. Choose a strong DB password → **SAVE IT SOMEWHERE**
3. Select region: **Southeast Asia (Singapore)** — closest to India
4. Wait ~2 minutes for project to spin up

**Then get your keys:**
- Go to your project → **Settings** (gear icon, left sidebar)
- Click **API** under Configuration

Copy these 3 values:

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ⚠️ `SUPABASE_ANON_KEY` = "anon public" key (safe for frontend)
> ⚠️ `SUPABASE_SERVICE_KEY` = "service_role" key (backend only, never expose)

**Run migrations:**
- Go to Supabase Dashboard → **SQL Editor**
- Paste and run each migration file from `supabase/migrations/` in order (001 first, 007 last)

**Create Storage bucket:**
- Go to **Storage** → **New bucket**
- Name: `lab-reports`
- Toggle: **Public bucket** → ON
- Click Create

---

## STEP 2 — Groq (Primary AI — Free, No Card)
**Go to: https://console.groq.com → Sign Up**

1. Verify email
2. Go to **API Keys** (left sidebar)
3. Click **Create API Key**
4. Name it: `novacare`
5. Copy the key immediately (shown only once)

```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Free limits:** No credit card. Very generous daily limits. LLaMA 3.3 70B available.

---

## STEP 3 — OpenRouter (Lab Report Vision AI — Free)
**Go to: https://openrouter.ai → Sign Up**

1. Verify email
2. Go to **Keys** (top right menu)
3. Click **Create Key**
4. Name: `novacare`, leave credit limit empty
5. Copy key

```env
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Free models available:**
- `google/gemini-2.0-flash-exp:free` → 200 req/day (lab report vision)
- `deepseek/deepseek-chat-v3-0324:free` → 200 req/day (deep reasoning)

> No credit card needed for free models. Just sign up.

---

## STEP 4 — Google AI Studio (Fallback AI — Free)
**Go to: https://aistudio.google.com → Sign in with Google**

1. Click **Get API Key** (top left)
2. Click **Create API key**
3. Select **Create API key in new project**
4. Copy key

```env
GOOGLE_AI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**Free limits:** 60 requests/minute, 1500 requests/day — plenty for demo.

---

## STEP 5 — Expo (Mobile Push Notifications)
**Go to: https://expo.dev → Sign Up (free)**

1. Create account
2. Go to **Projects** → **Create project**
3. Name: `novacare`
4. Copy your **Project ID** from the project settings page

```env
EXPO_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Then in your terminal:
```bash
cd apps/mobile
npx expo login    # login with your expo account
```

---

## STEP 6 — Railway (Backend Deployment)
**Go to: https://railway.app → Sign Up with GitHub**

> ⚠️ Railway requires a credit card for the free $5/month credit tier.
> You will NOT be charged unless you exceed $5 of usage. A hackathon demo won't come close.

1. Connect GitHub account
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `novacare` repo → select `services/api` folder
4. Railway auto-detects Python and uses your `Procfile`
5. After deploy, go to **Settings** → **Domains** → **Generate Domain**
6. Copy your Railway URL

```env
RAILWAY_URL=https://novacare-api-production.up.railway.app
```

**Add all env vars to Railway:**
- In your project → **Variables** tab
- Add every variable from this guide one by one

---

## FINAL: Complete .env Files

### `services/api/.env` (Backend)
```env
# Environment
ENV=development

# Supabase
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# AI Providers
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_AI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

### `apps/mobile/.env` (Frontend — Expo)
```env
# Supabase (anon key is safe for frontend)
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Your Railway backend URL
EXPO_PUBLIC_API_URL=https://novacare-api-production.up.railway.app

# Expo
EXPO_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> ⚠️ IMPORTANT: In Expo/React Native, only variables starting with `EXPO_PUBLIC_` are accessible in the app code. Backend variables MUST NOT start with `EXPO_PUBLIC_`.

---

## TESTING CHECKLIST — Run These After Setup

### 1. Test Supabase connection
```bash
cd services/api
source venv/bin/activate
python -c "
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv()
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
print('Supabase:', sb.table('profiles').select('id').limit(1).execute())
"
```
Expected: `data=[]` or rows if you have data. No error = ✅

### 2. Test Groq
```bash
python -c "
import httpx, os
from dotenv import load_dotenv
load_dotenv()
r = httpx.post('https://api.groq.com/openai/v1/chat/completions',
  headers={'Authorization': f'Bearer {os.getenv(\"GROQ_API_KEY\")}'},
  json={'model':'llama-3.1-8b-instant','messages':[{'role':'user','content':'Say OK'}],'max_tokens':5}
)
print('Groq:', r.json()['choices'][0]['message']['content'])
"
```
Expected: `Groq: OK` = ✅

### 3. Test OpenRouter
```bash
python -c "
import httpx, os
from dotenv import load_dotenv
load_dotenv()
r = httpx.post('https://openrouter.ai/api/v1/chat/completions',
  headers={'Authorization': f'Bearer {os.getenv(\"OPENROUTER_API_KEY\")}', 'HTTP-Referer': 'https://novacare.health'},
  json={'model':'deepseek/deepseek-chat-v3-0324:free','messages':[{'role':'user','content':'Say OK'}],'max_tokens':5}
)
print('OpenRouter:', r.json()['choices'][0]['message']['content'])
"
```
Expected: `OpenRouter: OK` = ✅

### 4. Test Google AI
```bash
python -c "
import httpx, os
from dotenv import load_dotenv
load_dotenv()
key = os.getenv('GOOGLE_AI_API_KEY')
r = httpx.post(f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={key}',
  json={'contents':[{'parts':[{'text':'Say OK'}]}]}
)
print('Google AI:', r.json()['candidates'][0]['content']['parts'][0]['text'])
"
```
Expected: `Google AI: OK` = ✅

### 5. Start FastAPI locally
```bash
cd services/api
source venv/bin/activate
uvicorn main:app --reload --port 8000
```
Open browser: `http://localhost:8000/health`
Expected: `{"status": "ok", "service": "NovaCare API"}` = ✅

### 6. Start Expo app
```bash
cd apps/mobile
npx expo start
```
Scan QR code with Expo Go app on your phone. App should load. = ✅

---

## COMMON ERRORS & FIXES

| Error | Fix |
|-------|-----|
| `SUPABASE_URL not set` | You forgot to create `.env` file or ran from wrong folder |
| `401 Unauthorized` from Groq | API key wrong or expired — regenerate at console.groq.com |
| `429 Too Many Requests` from OpenRouter | Hit free daily limit (200 req) — wait until midnight UTC or switch to Groq |
| `relation "profiles" does not exist` | Migrations not run — go to Supabase SQL Editor and run them |
| Expo app shows blank screen | Check `EXPO_PUBLIC_API_URL` is set correctly in mobile `.env` |
| Railway deploy fails | Check `Procfile` exists in `services/api/` and requirements.txt is complete |
| `storage bucket not found` | Create `lab-reports` bucket in Supabase → Storage → New bucket |
| Push notifications not working | Must test on physical device, not simulator. iOS needs Apple dev account. |

---

## ⚡ QUICK DEMO SETUP (if no time for full deploy)

Run everything locally for demo:

```bash
# Terminal 1 — Backend
cd services/api && source venv/bin/activate && uvicorn main:app --reload

# Terminal 2 — Mobile (connects to localhost backend)
cd apps/mobile
# Change EXPO_PUBLIC_API_URL in .env to: http://YOUR_LAPTOP_IP:8000
# Find your IP: ifconfig | grep "inet " (Mac/Linux) or ipconfig (Windows)
npx expo start
```

Both phone and laptop must be on the **same WiFi network** for localhost to work.

---

> ✅ Once all 6 tests pass — NovaCare is fully live. You're ready to demo!
