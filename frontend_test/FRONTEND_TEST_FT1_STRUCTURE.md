# NovaCare Frontend Test — FT1: Project Structure & Config
> Paste FRONTEND_TEST_MASTER.md first, then this file.
> Run this FIRST.

---

## What This Tests
- All required files exist
- package.json has all dependencies
- app.json configured correctly
- .env has required variables
- Colors, Supabase client, API client configured
- Root layout handles auth routing
- TypeScript config valid

---

## Instructions for Agent

### Step 1 — Check all required files exist

Run this bash script:

```bash
cd apps/mobile

echo "=== Checking required files ==="

files=(
  "app/_layout.tsx"
  "app/(auth)/_layout.tsx"
  "app/(auth)/welcome.tsx"
  "app/(auth)/signin.tsx"
  "app/(auth)/signup.tsx"
  "app/(onboarding)/patient.tsx"
  "app/(app)/_layout.tsx"
  "app/(app)/index.tsx"
  "app/(app)/nurse.tsx"
  "app/(app)/vitals.tsx"
  "app/(app)/reports.tsx"
  "app/(app)/medicines.tsx"
  "app/(app)/weekly-reports.tsx"
  "app/(app)/profile.tsx"
  "app/(doctor)/_layout.tsx"
  "app/(doctor)/index.tsx"
  "store/authStore.ts"
  "store/chatStore.ts"
  "lib/supabase.ts"
  "lib/api.ts"
  "constants/colors.ts"
  "app.json"
  "package.json"
  ".env"
)

missing=0
for f in "${files[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ MISSING: $f"
    missing=$((missing+1))
  fi
done

echo ""
echo "Missing: $missing files"
```

### Step 2 — Check package.json has all dependencies

```bash
cd apps/mobile
echo "=== Checking dependencies ==="

deps=(
  "@supabase/supabase-js"
  "zustand"
  "@tanstack/react-query"
  "expo-router"
  "expo-notifications"
  "expo-document-picker"
  "expo-image-picker"
  "react-native-paper"
  "react-hook-form"
  "axios"
  "date-fns"
)

for dep in "${deps[@]}"; do
  if grep -q "\"$dep\"" package.json; then
    echo "  ✅ $dep"
  else
    echo "  ❌ MISSING dep: $dep — run: npx expo install $dep"
  fi
done
```

### Step 3 — Check .env has required variables

```bash
cd apps/mobile
echo "=== Checking .env ==="

vars=(
  "EXPO_PUBLIC_SUPABASE_URL"
  "EXPO_PUBLIC_SUPABASE_ANON_KEY"
  "EXPO_PUBLIC_API_URL"
)

if [ ! -f ".env" ]; then
  echo "  ❌ .env file missing! Create it with:"
  echo "     EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co"
  echo "     EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ..."
  echo "     EXPO_PUBLIC_API_URL=http://YOUR_IP:8000"
else
  for v in "${vars[@]}"; do
    if grep -q "$v" .env; then
      val=$(grep "$v" .env | cut -d'=' -f2)
      if [ -z "$val" ] || [ "$val" = '""' ]; then
        echo "  ❌ $v is EMPTY — fill it in .env"
      else
        echo "  ✅ $v = ${val:0:20}..."
      fi
    else
      echo "  ❌ $v MISSING from .env"
    fi
  done
fi
```

### Step 4 — Check colors.ts has all required colors

```bash
cd apps/mobile
echo "=== Checking constants/colors.ts ==="

colors=("primary" "primaryLight" "background" "card" "text" "textMuted" "border" "danger" "warning" "success" "accent")
for c in "${colors[@]}"; do
  if grep -q "$c" constants/colors.ts 2>/dev/null; then
    echo "  ✅ Colors.$c"
  else
    echo "  ❌ Colors.$c missing"
  fi
done
```

### Step 5 — Check root _layout.tsx has auth routing

```bash
cd apps/mobile
echo "=== Checking app/_layout.tsx ==="

checks=(
  "useAuthStore"
  "onboarding_complete"
  "role"
  "doctor"
  "welcome"
  "QueryClientProvider"
  "initialize"
)

for c in "${checks[@]}"; do
  if grep -q "$c" app/_layout.tsx 2>/dev/null; then
    echo "  ✅ has: $c"
  else
    echo "  ❌ MISSING: $c in _layout.tsx"
  fi
done
```

### Step 6 — Check app.json

```bash
cd apps/mobile
echo "=== Checking app.json ==="
python3 -c "
import json
with open('app.json') as f:
    data = json.load(f)
expo = data.get('expo', {})
checks = {
    'name': expo.get('name'),
    'slug': expo.get('slug'),
    'scheme': expo.get('scheme'),
    'expo-router plugin': any('expo-router' in str(p) for p in expo.get('plugins',[])),
    'expo-notifications plugin': any('expo-notifications' in str(p) for p in expo.get('plugins',[])),
}
for k,v in checks.items():
    icon = '✅' if v else '❌'
    print(f'  {icon} {k}: {v}')
"
```

### Step 7 — Install missing deps and check TypeScript

```bash
cd apps/mobile

# Install any missing packages
npm install --legacy-peer-deps 2>&1 | tail -5

# TypeScript check
echo "=== TypeScript check ==="
npx tsc --noEmit 2>&1 | head -40
echo "TypeScript check done"
```

### Step 8 — Report all findings

For every ❌ found above:
1. Open the file
2. Add the missing code
3. Re-run the check
4. Confirm ✅

---

## Auto-fixes Agent Should Apply

### Missing .env file
Create `apps/mobile/.env`:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=http://localhost:8000
EXPO_PROJECT_ID=
```
Tell user to fill in the values.

### Missing Colors
Add to `constants/colors.ts`:
```typescript
export const Colors = {
  primary:      '#0B8A73',
  primaryLight: '#02C39A',
  primaryDark:  '#085041',
  accent:       '#E8614D',
  gold:         '#F4C430',
  background:   '#F0FAF8',
  card:         '#FFFFFF',
  text:         '#1A3C3A',
  textMuted:    '#7BBFB5',
  midTxt:       '#2D6B64',
  border:       '#D1EDE9',
  danger:       '#E24B4A',
  warning:      '#F4C430',
  success:      '#02C39A',
};
```

### Root layout missing auth routing
The `app/_layout.tsx` must have:
```typescript
import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { registerForPushNotifications } from '../lib/notifications';

const queryClient = new QueryClient();

function RootNavigator() {
  const { profile, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
    registerForPushNotifications();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace('/(auth)/welcome');
    } else if (!profile.onboarding_complete) {
      router.replace(
        profile.role === 'patient' ? '/(onboarding)/patient' : '/(onboarding)/doctor'
      );
    } else {
      router.replace(profile.role === 'doctor' ? '/(doctor)' : '/(app)');
    }
  }, [profile, loading]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="(doctor)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootNavigator />
    </QueryClientProvider>
  );
}
```
