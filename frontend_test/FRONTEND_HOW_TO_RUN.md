# NovaCare Frontend — How to Run Guide
> React Native (Expo) — Complete setup and run instructions

---

## ⚡ QUICKEST WAY (5 minutes)

### Step 1 — Install Expo Go on your phone
- **Android:** Play Store → search "Expo Go" → install
- **iOS:** App Store → search "Expo Go" → install

### Step 2 — Create mobile .env file
```bash
cd apps/mobile
```

Create file `apps/mobile/.env` with this content:
```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
EXPO_PUBLIC_API_URL=http://YOUR_LAPTOP_IP:8000
EXPO_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> ⚠️ Find YOUR_LAPTOP_IP:
> - **Windows:** open CMD → type `ipconfig` → look for IPv4 Address (e.g. 192.168.1.5)
> - **Mac/Linux:** open Terminal → type `ifconfig | grep "inet "` → look for 192.168.x.x
> - Both phone and laptop MUST be on same WiFi!

### Step 3 — Start the backend (keep this running)
```bash
cd services/api
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Step 4 — Start the Expo app
```bash
cd apps/mobile
npm install
npx expo start
```

### Step 5 — Scan QR code
- Open **Expo Go** app on phone
- Android: scan the QR code shown in terminal
- iOS: open Camera app → scan QR → tap the Expo Go link

**App should open on your phone!** 🎉

---

## 🔧 If Something Goes Wrong

### "Network request failed" / blank screen
```bash
# Check your IP is correct in .env
# Make sure both devices on same WiFi
# Try: EXPO_PUBLIC_API_URL=http://192.168.1.X:8000  (your actual IP)
```

### "Module not found" errors
```bash
cd apps/mobile
rm -rf node_modules
npm install
npx expo start --clear
```

### Expo login required
```bash
npx expo login
# Enter your expo.dev username and password
```

### Metro bundler stuck
```bash
# Press 'r' in the terminal to reload
# Or press Ctrl+C and restart: npx expo start --clear
```

### iOS simulator (Mac only, no physical device needed)
```bash
npx expo start
# Press 'i' to open iOS simulator
# Xcode must be installed
```

### Android emulator (Android Studio needed)
```bash
npx expo start
# Press 'a' to open Android emulator
# Android Studio + AVD must be set up
```

---

## 📱 All Screens You Should See

Once app opens, verify these screens exist:

| Screen | How to reach |
|--------|-------------|
| Welcome | App launch (not logged in) |
| Sign Up | Welcome → "Get Started" |
| Sign In | Welcome → "Already have account" |
| Patient Onboarding (5 steps) | After patient signup |
| Doctor Onboarding | After doctor signup |
| Home (Dashboard) | After onboarding complete |
| Nurse (AI Chat) | Bottom tab → chat bubble icon |
| Vitals | Bottom tab → heart icon |
| Reports (Lab) | Bottom tab → clipboard icon |
| Medicines | Bottom tab → pill icon |
| Weekly Reports | Bottom tab → chart icon |
| Profile | Bottom tab → person icon |
| Doctor Dashboard | Doctor account → patients tab |
| Report Detail | Reports tab → tap any report |

---

## 🌐 Using Railway URL Instead of localhost

If backend is deployed on Railway:
```env
EXPO_PUBLIC_API_URL=https://novacare-api-production.up.railway.app
```

No same-WiFi requirement when using Railway URL!

---

## 🔁 Full Restart (nuclear option)
```bash
cd apps/mobile
rm -rf node_modules .expo
npm install
npx expo start --clear
```
