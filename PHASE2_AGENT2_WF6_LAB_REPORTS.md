# NovaCare — Phase 2 | Agent 2
## Workflows: WF6 — Lab Report Upload & AI Analysis
> Paste NOVACARE_MASTER.md into context first, then this file.
> Branch: `phase2/lab-reports`
> Model: Claude Opus
> Dependency: Phase 1 merged into `develop`. Agent 1's AI providers (services/ai/providers.py) must be available.

---

## Goal
Build the complete lab report pipeline: upload PDF or image → store in Supabase Storage → OCR/extract text → AI analysis using Gemini Vision (free) → parsed values with flags → patient-friendly explanation.

---

## WF6 Part A — Backend Lab Report Service

### Step 1 — File Upload & Storage
`services/api/routers/lab_reports.py`:
```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import base64, io, json, re
from dependencies import get_current_user, supabase
from services.ai.providers import ai_complete, call_openrouter
import httpx

router = APIRouter()

ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/jpg", "image/webp"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/upload")
async def upload_lab_report(
    file: UploadFile = File(...),
    report_type: str = Form("blood_test"),
    report_date: Optional[str] = Form(None),
    user=Depends(get_current_user)
):
    """Upload a lab report (PDF or image) and trigger AI analysis."""

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Max 10MB.")

    # 1. Upload to Supabase Storage
    file_path = f"{user.id}/{report_type}_{report_date or 'unknown'}_{file.filename}"
    storage_res = supabase.storage.from_("lab-reports").upload(
        file_path,
        content,
        {"content-type": file.content_type, "upsert": "true"}
    )

    file_url = supabase.storage.from_("lab-reports").get_public_url(file_path)

    # 2. Create DB record
    report_res = supabase.table("lab_reports").insert({
        "patient_id": user.id,
        "report_type": report_type,
        "report_date": report_date,
        "file_url": file_url,
        "file_name": file.filename,
        "overall_status": "pending",
        "uploaded_by": user.id,
    }).execute()

    report_id = report_res.data[0]["id"]

    # 3. Trigger async AI analysis
    import asyncio
    asyncio.create_task(analyze_report(report_id, content, file.content_type, user.id))

    return {
        "success": True,
        "data": {"report_id": report_id, "message": "Report uploaded. Analysis in progress..."},
        "error": None
    }


async def analyze_report(report_id: str, content: bytes, content_type: str, patient_id: str):
    """Background task: OCR + AI analysis of lab report."""
    try:
        # Extract text from file
        raw_text = await extract_text(content, content_type)

        if not raw_text or len(raw_text) < 20:
            supabase.table("lab_reports").update({
                "raw_text": "Could not extract text",
                "overall_status": "abnormal",
                "ai_summary": "We could not read this report clearly. Please try uploading a clearer image or PDF.",
            }).eq("id", report_id).execute()
            return

        # Parse structured values
        parsed = parse_lab_values(raw_text)

        # AI analysis
        analysis_prompt = f"""You are a medical AI assistant helping a patient understand their lab report.

Extracted report text:
{raw_text[:3000]}

Parsed values: {json.dumps(parsed)}

Your task:
1. Write a PATIENT-FRIENDLY summary (3-4 sentences, simple language, no jargon)
2. Identify any abnormal values and explain what they mean in plain language
3. Give 2-3 specific lifestyle suggestions based on the results
4. Assign an overall status: normal, borderline, abnormal, or critical

Return ONLY valid JSON:
{{
  "summary": "...",
  "flags": [
    {{"parameter": "...", "value": "...", "status": "normal|high|low|critical", "explanation": "...", "suggestion": "..."}}
  ],
  "overall_status": "normal|borderline|abnormal|critical",
  "lifestyle_tips": ["...", "...", "..."]
}}"""

        raw_analysis = await ai_complete(
            "deep_reasoning",
            [{"role": "user", "content": analysis_prompt}]
        )

        clean = raw_analysis.strip().replace("```json", "").replace("```", "")
        analysis = json.loads(clean)

        # Update report
        supabase.table("lab_reports").update({
            "raw_text": raw_text[:5000],
            "parsed_values": parsed,
            "ai_summary": analysis.get("summary"),
            "ai_flags": analysis.get("flags", []),
            "overall_status": analysis.get("overall_status", "normal"),
        }).eq("id", report_id).execute()

        # Auto-populate vitals if blood test
        auto_populate_vitals(patient_id, parsed)

    except Exception as e:
        print(f"[LAB] Analysis failed for {report_id}: {e}")
        supabase.table("lab_reports").update({
            "overall_status": "abnormal",
            "ai_summary": "Analysis encountered an error. Please try again or contact support.",
        }).eq("id", report_id).execute()


async def extract_text(content: bytes, content_type: str) -> str:
    """Extract text from PDF or image using Gemini Vision (free via OpenRouter)."""

    if content_type == "application/pdf":
        # For PDF — use PyPDF2 first, then vision as fallback
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            text = " ".join(page.extract_text() or "" for page in reader.pages)
            if len(text.strip()) > 50:
                return text
        except Exception:
            pass

    # Use Gemini Vision for images or unreadable PDFs
    b64 = base64.b64encode(content).decode()
    mime = content_type if content_type != "application/pdf" else "image/jpeg"

    payload = {
        "model": "google/gemini-2.0-flash-exp:free",
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{b64}"}
                },
                {
                    "type": "text",
                    "text": "Extract ALL text from this medical lab report. Include every number, unit, reference range, and parameter name. Return the raw text exactly as it appears."
                }
            ]
        }],
        "max_tokens": 2000
    }

    import os
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://novacare.health",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


def parse_lab_values(text: str) -> dict:
    """
    Extract common lab parameters from text using regex patterns.
    Returns dict of {parameter: {value, unit, normal_range, status}}
    """
    parsed = {}
    text_lower = text.lower()

    patterns = [
        # Haematology
        ("hemoglobin",     r"h(?:a?e)?moglobin[:\s]+(\d+\.?\d*)\s*(g/dl|g/l)?", "g/dL", "12.0-17.0"),
        ("hba1c",          r"hb\s*a1c[:\s]+(\d+\.?\d*)\s*(%)?",                 "%",     "4.0-5.6"),
        ("rbc",            r"r\.?b\.?c[:\s]+(\d+\.?\d*)",                        "M/µL",  "4.5-5.5"),
        ("wbc",            r"w\.?b\.?c[:\s]+(\d+\.?\d*)",                        "K/µL",  "4.5-11.0"),
        ("platelets",      r"platelet[s]?[:\s]+(\d+)",                           "K/µL",  "150-400"),
        # Biochemistry
        ("glucose_fasting",r"(?:fasting\s+)?(?:blood\s+)?glucose[:\s]+(\d+\.?\d*)", "mg/dL", "70-99"),
        ("creatinine",     r"creatinine[:\s]+(\d+\.?\d*)",                       "mg/dL", "0.6-1.2"),
        ("urea",           r"(?:blood\s+)?urea[:\s]+(\d+\.?\d*)",                "mg/dL", "7-25"),
        ("uric_acid",      r"uric\s+acid[:\s]+(\d+\.?\d*)",                      "mg/dL", "3.5-7.2"),
        ("cholesterol",    r"total\s+cholesterol[:\s]+(\d+\.?\d*)",              "mg/dL", "<200"),
        ("ldl",            r"l\.?d\.?l[:\s]+(\d+\.?\d*)",                        "mg/dL", "<100"),
        ("hdl",            r"h\.?d\.?l[:\s]+(\d+\.?\d*)",                        "mg/dL", ">40"),
        ("triglycerides",  r"triglyceride[s]?[:\s]+(\d+\.?\d*)",                "mg/dL", "<150"),
        # Thyroid
        ("tsh",            r"t\.?s\.?h[:\s]+(\d+\.?\d*)",                        "µIU/mL", "0.4-4.0"),
        ("t3",             r"\bt3\b[:\s]+(\d+\.?\d*)",                           "ng/dL", "80-200"),
        ("t4",             r"\bt4\b[:\s]+(\d+\.?\d*)",                           "µg/dL", "5.0-12.0"),
        # Liver
        ("sgpt",           r"s\.?g\.?p\.?t|a\.?l\.?t[:\s]+(\d+\.?\d*)",         "U/L",   "7-56"),
        ("sgot",           r"s\.?g\.?o\.?t|a\.?s\.?t[:\s]+(\d+\.?\d*)",         "U/L",   "10-40"),
        # Vitamins
        ("vitamin_d",      r"vitamin\s+d[:\s]+(\d+\.?\d*)",                      "ng/mL", "30-100"),
        ("vitamin_b12",    r"vitamin\s+b[\-]?12[:\s]+(\d+\.?\d*)",               "pg/mL", "200-900"),
    ]

    for param, pattern, unit, normal in patterns:
        match = re.search(pattern, text_lower)
        if match:
            try:
                value = float(match.group(1))
                status = classify_value(param, value)
                parsed[param] = {
                    "value": value,
                    "unit": unit,
                    "normal_range": normal,
                    "status": status,
                }
            except Exception:
                pass

    return parsed


def classify_value(param: str, value: float) -> str:
    """Simple rule-based classification."""
    ranges = {
        "hemoglobin":      (12.0, 17.0), "hba1c":         (0, 5.7),
        "glucose_fasting": (70, 99),     "creatinine":    (0.6, 1.2),
        "cholesterol":     (0, 200),     "ldl":           (0, 100),
        "triglycerides":   (0, 150),     "tsh":           (0.4, 4.0),
        "vitamin_d":       (30, 100),    "vitamin_b12":   (200, 900),
    }
    if param in ranges:
        lo, hi = ranges[param]
        if value < lo:   return "low"
        if value > hi:   return "high"
        return "normal"
    return "unknown"


def auto_populate_vitals(patient_id: str, parsed: dict):
    """Auto-create a vitals log entry from parsed blood test values."""
    entry = {"patient_id": patient_id}
    if "glucose_fasting" in parsed:
        entry["blood_sugar_fasting"] = parsed["glucose_fasting"]["value"]
    if entry:
        supabase.table("vitals_logs").insert(entry).execute()


@router.get("/")
async def get_reports(user=Depends(get_current_user)):
    """Get all lab reports for current patient."""
    res = supabase.table("lab_reports")\
        .select("id,report_type,report_date,file_name,overall_status,ai_summary,ai_flags,created_at")\
        .eq("patient_id", user.id)\
        .order("created_at", desc=True).execute()
    return {"success": True, "data": res.data, "error": None}


@router.get("/{report_id}")
async def get_report_detail(report_id: str, user=Depends(get_current_user)):
    """Get full detail of a single lab report."""
    res = supabase.table("lab_reports")\
        .select("*")\
        .eq("id", report_id)\
        .eq("patient_id", user.id)\
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"success": True, "data": res.data, "error": None}
```

---

## WF6 Part B — Frontend Lab Reports

### Lab Reports Screen
`apps/mobile/app/(app)/reports.tsx`:
```typescript
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';
import { router } from 'expo-router';

const STATUS_COLORS: Record<string, string> = {
  normal:     Colors.success,
  borderline: Colors.warning,
  abnormal:   Colors.accent,
  critical:   Colors.danger,
  pending:    Colors.textMuted,
};

const STATUS_LABELS: Record<string, string> = {
  normal: '✓ Normal', borderline: '⚠ Borderline',
  abnormal: '⚠ Abnormal', critical: '🔴 Critical', pending: '⏳ Analyzing...',
};

const REPORT_TYPES = [
  { key: 'blood_test',  label: 'Blood Test'    },
  { key: 'urine',       label: 'Urine Test'    },
  { key: 'xray',        label: 'X-Ray'         },
  { key: 'ecg',         label: 'ECG'           },
  { key: 'mri',         label: 'MRI / CT Scan' },
  { key: 'other',       label: 'Other'         },
];

export default function ReportsScreen() {
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedType, setSelectedType] = useState('blood_test');
  const queryClient = useQueryClient();

  const { data: reports, isLoading, refetch } = useQuery({
    queryKey: ['lab-reports'],
    queryFn: () => api.get('/labs/').then((r: any) => r.data),
  });

  const uploadFile = async (uri: string, mimeType: string, fileName: string) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: mimeType, name: fileName } as any);
      formData.append('report_type', selectedType);
      formData.append('report_date', new Date().toISOString().split('T')[0]);

      await api.post('/labs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      queryClient.invalidateQueries({ queryKey: ['lab-reports'] });
      setShowUpload(false);
      Alert.alert('Uploaded!', 'Your report is being analyzed by Nova. Check back in a moment.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.message || 'Something went wrong');
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadFile(asset.uri, 'application/pdf', asset.name);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() || 'jpg';
      await uploadFile(asset.uri, `image/${ext}`, `report.${ext}`);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.9 });
    if (!result.canceled && result.assets[0]) {
      await uploadFile(result.assets[0].uri, 'image/jpeg', 'lab_photo.jpg');
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Lab Reports</Text>
          <Text style={styles.sub}>Upload and AI-analyze your reports</Text>
        </View>
        <TouchableOpacity style={styles.uploadBtn} onPress={() => setShowUpload(true)}>
          <Text style={styles.uploadBtnText}>+ Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Upload Panel */}
      {showUpload && (
        <View style={styles.uploadPanel}>
          <Text style={styles.panelTitle}>Report Type</Text>
          <View style={styles.typeGrid}>
            {REPORT_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeBtn, selectedType === t.key && styles.typeBtnActive]}
                onPress={() => setSelectedType(t.key)}
              >
                <Text style={[styles.typeBtnText, selectedType === t.key && styles.typeBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.panelTitle}>Choose Source</Text>
          <View style={styles.sourceRow}>
            {[
              { label: '📄 PDF', action: pickDocument },
              { label: '🖼️ Gallery', action: pickImage },
              { label: '📷 Camera', action: takePhoto },
            ].map(src => (
              <TouchableOpacity key={src.label} style={styles.sourceBtn} onPress={src.action} disabled={uploading}>
                <Text style={styles.sourceBtnText}>{src.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {uploading && (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.uploadingText}>Uploading and analyzing with AI...</Text>
            </View>
          )}

          <TouchableOpacity onPress={() => setShowUpload(false)}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reports List */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.primary} />
      ) : reports?.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🧪</Text>
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptyText}>Upload your blood test, X-ray, or any lab report and Nova will analyze it for you.</Text>
        </View>
      ) : (
        reports?.map((report: any) => (
          <TouchableOpacity
            key={report.id}
            style={styles.reportCard}
            onPress={() => router.push(`/(app)/report-detail?id=${report.id}`)}
          >
            <View style={styles.reportHeader}>
              <View style={styles.reportLeft}>
                <Text style={styles.reportIcon}>🧪</Text>
                <View>
                  <Text style={styles.reportName}>{report.file_name}</Text>
                  <Text style={styles.reportType}>{REPORT_TYPES.find(t => t.key === report.report_type)?.label || report.report_type}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[report.overall_status]}20` }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[report.overall_status] }]}>
                  {STATUS_LABELS[report.overall_status]}
                </Text>
              </View>
            </View>
            {report.ai_summary && (
              <Text style={styles.reportSummary} numberOfLines={2}>{report.ai_summary}</Text>
            )}
            <Text style={styles.reportDate}>
              {new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 56 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, marginTop: 3 },
  uploadBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  uploadPanel: { backgroundColor: Colors.card, borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: Colors.border },
  panelTitle: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, marginBottom: 10, marginTop: 8 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primary}15` },
  typeBtnText: { fontSize: 12, color: Colors.textMuted },
  typeBtnTextActive: { color: Colors.primary, fontWeight: '600' },
  sourceRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  sourceBtn: { flex: 1, backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 14, alignItems: 'center' },
  sourceBtnText: { fontSize: 13, color: Colors.text, fontWeight: '500' },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  uploadingText: { fontSize: 13, color: Colors.textMuted },
  cancelText: { color: Colors.textMuted, textAlign: 'center', marginTop: 16, fontSize: 13 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  reportCard: { backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: Colors.border },
  reportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  reportLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  reportIcon: { fontSize: 28 },
  reportName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  reportType: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '700' },
  reportSummary: { fontSize: 13, color: Colors.textMuted, lineHeight: 20, marginBottom: 8 },
  reportDate: { fontSize: 11, color: Colors.textMuted },
});
```

### Report Detail Screen
`apps/mobile/app/(app)/report-detail.tsx`:
```typescript
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Colors } from '../../constants/colors';

const FLAG_COLORS: Record<string, string> = {
  normal: Colors.success, high: Colors.accent,
  low: Colors.warning, critical: Colors.danger, unknown: Colors.textMuted,
};

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: report, isLoading } = useQuery({
    queryKey: ['lab-report', id],
    queryFn: () => api.get(`/labs/${id}`).then((r: any) => r.data),
  });

  if (isLoading) return <ActivityIndicator style={{ flex: 1 }} color={Colors.primary} />;
  if (!report) return <Text>Report not found</Text>;

  const flags: any[] = report.ai_flags || [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Summary card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Nova's Analysis</Text>
        <Text style={styles.summaryText}>{report.ai_summary || 'Analysis in progress...'}</Text>
      </View>

      {/* Flagged values */}
      {flags.length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>Values to Note</Text>
          {flags.map((flag: any, i: number) => (
            <View key={i} style={styles.flagCard}>
              <View style={styles.flagHeader}>
                <Text style={styles.flagParam}>{flag.parameter}</Text>
                <View style={[styles.flagBadge, { backgroundColor: `${FLAG_COLORS[flag.status] || Colors.textMuted}20` }]}>
                  <Text style={[styles.flagStatus, { color: FLAG_COLORS[flag.status] || Colors.textMuted }]}>
                    {flag.status?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.flagValue}>{flag.value}</Text>
              <Text style={styles.flagExplanation}>{flag.explanation}</Text>
              {flag.suggestion && (
                <View style={styles.suggestionBox}>
                  <Text style={styles.suggestionText}>💡 {flag.suggestion}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Parsed values table */}
      {report.parsed_values && Object.keys(report.parsed_values).length > 0 && (
        <View>
          <Text style={styles.sectionTitle}>All Values</Text>
          <View style={styles.valuesTable}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCell, styles.tableHeaderText, { flex: 2 }]}>Parameter</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Value</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Normal Range</Text>
              <Text style={[styles.tableCell, styles.tableHeaderText]}>Status</Text>
            </View>
            {Object.entries(report.parsed_values).map(([key, val]: any) => (
              <View key={key} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2, textTransform: 'capitalize' }]}>
                  {key.replace(/_/g, ' ')}
                </Text>
                <Text style={styles.tableCell}>{val.value} {val.unit}</Text>
                <Text style={styles.tableCell}>{val.normal_range}</Text>
                <Text style={[styles.tableCell, { color: FLAG_COLORS[val.status] || Colors.text, fontWeight: '600' }]}>
                  {val.status}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingTop: 32, paddingBottom: 48 },
  summaryCard: { backgroundColor: `${Colors.primary}12`, borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: `${Colors.primary}30` },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: 10 },
  summaryText: { fontSize: 14, color: Colors.text, lineHeight: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  flagCard: { backgroundColor: Colors.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
  flagHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  flagParam: { fontSize: 14, fontWeight: '700', color: Colors.text, textTransform: 'capitalize' },
  flagBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  flagStatus: { fontSize: 11, fontWeight: '700' },
  flagValue: { fontSize: 18, fontWeight: '700', color: Colors.primary, marginBottom: 6 },
  flagExplanation: { fontSize: 13, color: Colors.textMuted, lineHeight: 20 },
  suggestionBox: { backgroundColor: `${Colors.gold}15`, borderRadius: 8, padding: 10, marginTop: 8 },
  suggestionText: { fontSize: 12, color: Colors.text, lineHeight: 18 },
  valuesTable: { backgroundColor: Colors.card, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  tableHeader: { flexDirection: 'row', backgroundColor: Colors.primary, padding: 12 },
  tableHeaderText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  tableRow: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: Colors.border },
  tableCell: { flex: 1, fontSize: 11, color: Colors.text },
});
```

---

## WF6 Done Checklist
- [ ] `routers/lab_reports.py` — upload, analyze (async), get list, get detail
- [ ] `extract_text()` — PDF (PyPDF2) + Gemini Vision fallback
- [ ] `parse_lab_values()` — regex extraction of 20+ common parameters
- [ ] `classify_value()` — normal/high/low/critical classification
- [ ] `auto_populate_vitals()` — blood sugar auto-fills vitals log
- [ ] Supabase Storage bucket `lab-reports` created and tested
- [ ] Frontend `reports.tsx` — upload panel (PDF/image/camera), reports list
- [ ] Frontend `report-detail.tsx` — AI summary, flag cards, values table
- [ ] Test: Upload a real blood test PDF → verify text extraction
- [ ] Test: Upload a low-quality image → verify Gemini Vision fallback
- [ ] Test: HbA1c = 8.2 → verify it shows as "high" with explanation
- [ ] Test: report with critical value → verify doctor dashboard flag
- [ ] OpenRouter API key confirmed working for vision

---

## PR Instructions
```bash
git add .
git commit -m "feat(phase2): lab report upload + AI analysis + OCR + parsed values"
git push origin phase2/lab-reports
# PR: phase2/lab-reports → develop
# Tag: @Agent3 for review + integration test with WF5
```

## Notes for Agent 3 (Integration)
After merging WF5 (AI Engine) and WF6 (Lab Reports):
1. Test: upload a blood report → verify AI analysis uses `deep_reasoning` model
2. Test: lab report with critical hemoglobin → chat with Nova → verify she mentions it
3. Patient context in nurse chat should reference latest lab flags
4. Merge both into `develop`, tag Agent 1 and Agent 2: Phase 2 complete → start Phase 3
