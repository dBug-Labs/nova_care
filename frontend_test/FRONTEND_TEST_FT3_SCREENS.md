# NovaCare Frontend Test — FT3: Main App Screens
> Paste FRONTEND_TEST_MASTER.md first, then this file.
> Dependency: FT1 and FT2 must pass.

---

## What This Tests
- Home screen: mood check-in, stats grid, quick actions, AI note
- Nurse (AI Chat): streaming bubbles, quick prompts, session persistence
- Vitals screen: all 7 fields, today's reading, critical alert
- Lab Reports: upload panel (PDF/camera/gallery), reports list, status badges
- Report Detail: AI summary, flag cards, values table
- Medicines: today's schedule, taken/skip buttons, low stock warning, add form
- Weekly Reports: stats, narrative, goals, PDF download, share button
- Tab navigation: all 6 tabs working

---

## Instructions for Agent

### Step 1 — Check (app)/_layout.tsx has all 6 tabs

```bash
cd apps/mobile
echo "=== (app)/_layout.tsx tabs ==="

tabs=("index" "nurse" "vitals" "reports" "medicines" "weekly-reports" "profile")
for t in "${tabs[@]}"; do
  grep -q "$t" "app/(app)/_layout.tsx" 2>/dev/null \
    && echo "  ✅ tab: $t" \
    || echo "  ❌ MISSING tab: $t"
done
```

If any tab is missing, update `apps/mobile/app/(app)/_layout.tsx`:

```typescript
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors } from '../../constants/colors';

export default function AppLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor:   Colors.primary,
      tabBarInactiveTintColor: Colors.textMuted,
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: Colors.border, height: 60 },
      headerShown: false,
    }}>
      <Tabs.Screen name="index"          options={{ title: 'Home',     tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text> }} />
      <Tabs.Screen name="nurse"          options={{ title: 'Nova',     tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💬</Text> }} />
      <Tabs.Screen name="vitals"         options={{ title: 'Vitals',   tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>❤️</Text> }} />
      <Tabs.Screen name="reports"        options={{ title: 'Reports',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🧪</Text> }} />
      <Tabs.Screen name="medicines"      options={{ title: 'Meds',     tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>💊</Text> }} />
      <Tabs.Screen name="weekly-reports" options={{ title: 'Weekly',   tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📊</Text> }} />
      <Tabs.Screen name="profile"        options={{ title: 'Profile',  tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👤</Text> }} />
      <Tabs.Screen name="report-detail"  options={{ href: null }} />
    </Tabs>
  );
}
```

### Step 2 — Check Home screen (index.tsx)

```bash
cd apps/mobile
echo "=== (app)/index.tsx checks ==="

checks=(
  "mood_score"
  "MOOD_EMOJIS"
  "logMood"
  "greeting"
  "vitals/today"
  "statsGrid"
  "Quick Actions"
  "ai_daily_summary"
  "useQuery"
  "router.push"
)
for c in "${checks[@]}"; do
  grep -q "$c" "app/(app)/index.tsx" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 3 — Check Nurse screen (nurse.tsx)

```bash
cd apps/mobile
echo "=== (app)/nurse.tsx checks ==="

checks=(
  "useChatStore"
  "streaming"
  "streamingContent"
  "appendStreamToken"
  "commitStreamedMessage"
  "EventSource\|fetch.*stream\|SSE\|reader"
  "quickPrompts"
  "FlatList"
  "KeyboardAvoidingView"
  "session_id"
  "crisis\|helpline\|112"
  "Nova"
)
for c in "${checks[@]}"; do
  grep -qE "$c" "app/(app)/nurse.tsx" 2>/dev/null \
    && echo "  ✅ has: $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 4 — Check chatStore.ts

```bash
cd apps/mobile
echo "=== store/chatStore.ts checks ==="

checks=(
  "streaming"
  "streamingContent"
  "appendStreamToken"
  "commitStreamedMessage"
  "sessionId"
  "messages"
  "clearChat"
)
for c in "${checks[@]}"; do
  grep -q "$c" "store/chatStore.ts" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 5 — Check Vitals screen

```bash
cd apps/mobile
echo "=== (app)/vitals.tsx checks ==="

checks=(
  "systolic_bp"
  "diastolic_bp"
  "blood_sugar_fasting"
  "heart_rate"
  "spo2"
  "weight_kg"
  "temperature"
  "vitals/log"
  "risk_level"
  "critical"
  "burnout"
  "medicine_adherence"
  "ai_analysis"
  "vitals/today"
)
for c in "${checks[@]}"; do
  grep -q "$c" "app/(app)/vitals.tsx" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 6 — Check Lab Reports screen

```bash
cd apps/mobile
echo "=== (app)/reports.tsx checks ==="

checks=(
  "DocumentPicker"
  "ImagePicker"
  "launchCameraAsync"
  "launchImageLibraryAsync"
  "multipart/form-data"
  "labs/upload"
  "labs/"
  "overall_status"
  "STATUS_COLORS"
  "Analyzing"
  "report-detail"
  "useQuery"
)
for c in "${checks[@]}"; do
  grep -q "$c" "app/(app)/reports.tsx" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 7 — Check report-detail.tsx

```bash
cd apps/mobile
echo "=== (app)/report-detail.tsx checks ==="

if [ ! -f "app/(app)/report-detail.tsx" ]; then
  echo "  ❌ report-detail.tsx MISSING"
else
  checks=("ai_summary" "ai_flags" "parsed_values" "FLAG_COLORS" "explanation" "suggestion" "useLocalSearchParams" "labs/")
  for c in "${checks[@]}"; do
    grep -q "$c" "app/(app)/report-detail.tsx" 2>/dev/null \
      && echo "  ✅ $c" \
      || echo "  ❌ MISSING: $c"
  done
fi
```

### Step 8 — Check Medicines screen

```bash
cd apps/mobile
echo "=== (app)/medicines.tsx checks ==="

checks=(
  "medicines/today"
  "log-intake"
  "taken"
  "missed"
  "stock_count"
  "low_stock"
  "refill"
  "schedule_times"
  "TIME_SLOTS"
  "FREQUENCIES"
  "addMutation"
  "intakeMutation"
)
for c in "${checks[@]}"; do
  grep -q "$c" "app/(app)/medicines.tsx" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 9 — Check Weekly Reports screen

```bash
cd apps/mobile
echo "=== (app)/weekly-reports.tsx checks ==="

checks=(
  "reports-export/weekly"
  "generate-weekly"
  "ai_narrative"
  "highlights"
  "goals_next_week"
  "pdf_url"
  "Linking.openURL"
  "share-with-doctor"
  "shared_with_doctor"
  "avg_mood_score"
  "medicine_adherence_pct"
)
for c in "${checks[@]}"; do
  grep -q "$c" "app/(app)/weekly-reports.tsx" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 10 — Check API client (lib/api.ts)

```bash
cd apps/mobile
echo "=== lib/api.ts checks ==="

checks=(
  "EXPO_PUBLIC_API_URL"
  "axios.create"
  "Authorization"
  "Bearer"
  "supabase.auth.getSession"
  "interceptors"
)
for c in "${checks[@]}"; do
  grep -q "$c" "lib/api.ts" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 11 — Check Supabase client (lib/supabase.ts)

```bash
cd apps/mobile
echo "=== lib/supabase.ts checks ==="

checks=(
  "EXPO_PUBLIC_SUPABASE_URL"
  "EXPO_PUBLIC_SUPABASE_ANON_KEY"
  "createClient"
  "autoRefreshToken"
  "persistSession"
)
for c in "${checks[@]}"; do
  grep -q "$c" "lib/supabase.ts" 2>/dev/null \
    && echo "  ✅ $c" \
    || echo "  ❌ MISSING: $c"
done
```

### Step 12 — TypeScript compile check

```bash
cd apps/mobile
echo "=== TypeScript check ==="
npx tsc --noEmit 2>&1 | grep -E "error TS|warning" | head -20
echo "=== done ==="
```

For any TypeScript error shown:
1. Open the file mentioned
2. Fix the error (missing import, wrong type, etc.)
3. Re-run the check

### Step 13 — Final FT3 summary

```bash
cd apps/mobile
echo ""
echo "=== FT3 Final Summary ==="

screens=("app/(app)/index.tsx" "app/(app)/nurse.tsx" "app/(app)/vitals.tsx"
         "app/(app)/reports.tsx" "app/(app)/report-detail.tsx"
         "app/(app)/medicines.tsx" "app/(app)/weekly-reports.tsx"
         "app/(app)/profile.tsx" "app/(app)/_layout.tsx"
         "store/chatStore.ts" "lib/api.ts" "lib/supabase.ts")

ok=0; fail=0
for f in "${screens[@]}"; do
  if [ -f "$f" ] && [ -s "$f" ]; then
    echo "  ✅ $f"
    ok=$((ok+1))
  else
    echo "  ❌ $f (missing or empty)"
    fail=$((fail+1))
  fi
done
echo "  SCORE: $ok/${#screens[@]} screens present"
```
