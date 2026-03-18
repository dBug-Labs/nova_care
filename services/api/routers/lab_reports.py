from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
import base64, io, json, re, os
from dependencies import get_current_user, supabase
from services.ai.providers import ai_complete, call_openrouter
import httpx

router = APIRouter()

ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/jpg", "image/webp", "text/plain"}
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
    file_path = f"{user['id']}/{report_type}_{report_date or 'unknown'}_{file.filename}"
    storage_res = supabase.storage.from_("lab-reports").upload(
        file_path,
        content,
        {"content-type": file.content_type, "upsert": "true"}
    )

    file_url = supabase.storage.from_("lab-reports").get_public_url(file_path)

    # 2. Create DB record
    report_res = supabase.table("lab_reports").insert({
        "patient_id": user['id'],
        "report_type": report_type,
        "report_date": report_date,
        "file_url": file_url,
        "file_name": file.filename,
        "overall_status": "pending",
        "uploaded_by": user['id'],
    }).execute()

    report_id = report_res.data[0]["id"]

    # 3. Trigger async AI analysis
    import asyncio
    asyncio.create_task(analyze_report(report_id, content, file.content_type, user['id']))

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
    """Extract text from PDF or image. For images, use Groq text analysis as fallback."""

    if content_type == "application/pdf":
        # For PDF — use PyPDF2 first
        try:
            import PyPDF2
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            text = " ".join(page.extract_text() or "" for page in reader.pages)
            if len(text.strip()) > 50:
                return text
        except Exception:
            pass

    # For text/plain files, just decode directly
    if content_type in ("text/plain",):
        try:
            return content.decode("utf-8")
        except:
            return content.decode("latin-1")

    # For images or unreadable PDFs, use Groq to analyze text description
    try:
        text_hint = content.decode("utf-8", errors="ignore")[:3000]
        result = await ai_complete(
            "lab_vision",
            [{"role": "user", "content": f"Extract ALL lab values, parameters, numbers, units, and reference ranges from this text:\n\n{text_hint}"}]
        )
        return result
    except Exception:
        return content.decode("utf-8", errors="ignore")[:3000]


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
    if "hemoglobin" in parsed:
        pass # Add more as needed. But the guide only specifies glucose_fasting and maybe others.
    
    # We only insert if we gathered at least one actual vital stat mapped
    if len(entry) > 1:
        supabase.table("vitals_logs").insert(entry).execute()


@router.get("/")
async def get_reports(user=Depends(get_current_user)):
    """Get all lab reports for current patient."""
    res = supabase.table("lab_reports")\
        .select("id,report_type,report_date,file_name,overall_status,ai_summary,ai_flags,created_at")\
        .eq("patient_id", user['id'])\
        .order("created_at", desc=True).execute()
    return {"success": True, "data": res.data, "error": None}


@router.get("/{report_id}")
async def get_report_detail(report_id: str, user=Depends(get_current_user)):
    """Get full detail of a single lab report."""
    res = supabase.table("lab_reports")\
        .select("*")\
        .eq("id", report_id)\
        .eq("patient_id", user['id'])\
        .single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"success": True, "data": res.data, "error": None}
