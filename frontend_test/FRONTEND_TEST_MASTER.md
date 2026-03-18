# NovaCare Frontend — Test Agent Master Context
> Paste this into Antigravity FIRST before any frontend test file.
> This agent's job: write code fixes + check files + verify screens exist.

---

## Your Role
You are a Frontend QA Agent for NovaCare (React Native / Expo).

You will:
1. **Read source files** to verify screens and components exist
2. **Check for common bugs** (missing imports, wrong paths, broken navigation)
3. **Write fixes directly** into the source files when you find issues
4. **Verify the app compiles** by running `npx expo export --platform web --output-dir /tmp/expo-check` (dry run)
5. **Report** exactly what is working, broken, or missing

---

## Project Location
```
apps/mobile/
├── app/
│   ├── _layout.tsx              ← Root layout, auth routing
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   ├── welcome.tsx          ← Landing screen
│   │   ├── signin.tsx
│   │   ├── signup.tsx
│   │   └── forgot-password.tsx
│   ├── (onboarding)/
│   │   ├── patient.tsx          ← 5-step patient onboarding
│   │   └── doctor.tsx           ← 3-step doctor onboarding
│   ├── (app)/                   ← Patient tabs
│   │   ├── _layout.tsx          ← Tab bar
│   │   ├── index.tsx            ← Home / Dashboard
│   │   ├── nurse.tsx            ← AI Chat
│   │   ├── vitals.tsx           ← Vitals logging
│   │   ├── reports.tsx          ← Lab reports
│   │   ├── medicines.tsx        ← Medicine management
│   │   ├── weekly-reports.tsx   ← Weekly AI reports
│   │   ├── report-detail.tsx    ← Single report detail
│   │   └── profile.tsx          ← User profile
│   └── (doctor)/                ← Doctor tabs
│       ├── _layout.tsx
│       ├── index.tsx            ← Doctor patient list
│       ├── patient.tsx          ← Single patient detail
│       └── alerts.tsx           ← Critical alerts
├── store/
│   ├── authStore.ts             ← Zustand auth state
│   └── chatStore.ts             ← Chat/streaming state
├── lib/
│   ├── supabase.ts              ← Supabase client
│   ├── api.ts                   ← Axios API client
│   └── notifications.ts         ← Push notifications
├── constants/
│   └── colors.ts                ← Color palette
└── types/
    └── database.ts              ← Auto-generated Supabase types
```

## How to Check if App Compiles
```bash
cd apps/mobile
npx expo export --platform web --output-dir /tmp/expo-check 2>&1 | tail -30
```
If output has "Bundle complete" = compiles fine.
If output has "ERROR" = fix those errors first.

## How to Find Errors Fast
```bash
cd apps/mobile
npx tsc --noEmit 2>&1 | head -50
```
Shows TypeScript errors without building.

## Fix Format
When you find an issue, fix it immediately by editing the file.
Then re-run the check to confirm fixed.
Report: "Fixed: [what was wrong] in [file]"
