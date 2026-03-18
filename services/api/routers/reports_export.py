from fastapi import APIRouter, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import date, timedelta, datetime
from dependencies import get_current_user, supabase
from services.ai.providers import ai_complete
import json, io

router = APIRouter()


@router.post("/generate-weekly")
async def generate_weekly_report(
    background_tasks: BackgroundTasks,
    week_start: Optional[str] = None,
    user=Depends(get_current_user)
):
    """Generate weekly health report. If week_start not provided, uses last Monday."""
    if week_start:
        ws = date.fromisoformat(week_start)
    else:
        today = date.today()
        ws = today - timedelta(days=today.weekday())  # Last Monday
    we = ws + timedelta(days=6)

    # Check if already generated
    existing = supabase.table("weekly_reports")\
        .select("id,pdf_url")\
        .eq("patient_id", user.id)\
        .eq("week_start", str(ws)).execute().data
    if existing:
        return {"success": True, "data": existing[0], "error": None}

    # Create stub record
    record = supabase.table("weekly_reports").insert({
        "patient_id": user.id,
        "week_start": str(ws),
        "week_end": str(we),
    }).execute().data[0]

    # Generate in background
    background_tasks.add_task(build_weekly_report, record["id"], user.id, ws, we)

    return {"success": True, "data": {"report_id": record["id"], "status": "generating"}, "error": None}


async def build_weekly_report(report_id: str, patient_id: str, ws: date, we: date):
    """Full report generation pipeline."""
    try:
        ws_str = str(ws)
        we_str = str(we)

        # ── Gather all data ──
        profile = supabase.table("patient_profiles")\
            .select("*, profiles(full_name, date_of_birth)").eq("id", patient_id).single().execute().data or {}

        vitals = supabase.table("vitals_logs")\
            .select("*").eq("patient_id", patient_id)\
            .gte("logged_at", f"{ws_str}T00:00:00")\
            .lte("logged_at", f"{we_str}T23:59:59")\
            .order("logged_at").execute().data or []

        wellness = supabase.table("wellness_logs")\
            .select("*").eq("patient_id", patient_id)\
            .gte("log_date", ws_str).lte("log_date", we_str)\
            .order("log_date").execute().data or []

        med_logs = supabase.table("medicine_logs")\
            .select("status").eq("patient_id", patient_id)\
            .gte("created_at", f"{ws_str}T00:00:00")\
            .lte("created_at", f"{we_str}T23:59:59").execute().data or []

        # ── Compute stats ──
        avg_mood   = sum(w["mood_score"] for w in wellness if w.get("mood_score")) / max(len([w for w in wellness if w.get("mood_score")]),1)
        avg_sleep  = sum(w["sleep_hours"] for w in wellness if w.get("sleep_hours")) / max(len([w for w in wellness if w.get("sleep_hours")]),1)
        avg_water  = sum(w["water_ml"] for w in wellness if w.get("water_ml")) / max(len([w for w in wellness if w.get("water_ml")]),1)
        total_exer = sum(w.get("exercise_minutes", 0) for w in wellness)
        taken      = sum(1 for m in med_logs if m["status"] == "taken")
        adherence  = round(taken / len(med_logs) * 100) if med_logs else 0

        avg_bp_sys = sum(v["systolic_bp"] for v in vitals if v.get("systolic_bp")) / max(len([v for v in vitals if v.get("systolic_bp")]),1)
        avg_sugar  = sum(v["blood_sugar_fasting"] for v in vitals if v.get("blood_sugar_fasting")) / max(len([v for v in vitals if v.get("blood_sugar_fasting")]),1)

        vitals_summary = {
            "avg_bp": f"{avg_bp_sys:.0f}" if vitals else None,
            "avg_sugar": f"{avg_sugar:.0f}" if vitals else None,
            "readings_logged": len(vitals),
        }

        # ── AI Narrative ──
        name = profile.get("profiles", {}).get("full_name", "").split()[0] or "Patient"
        conditions = profile.get("chronic_conditions", [])

        narrative_prompt = f"""Write a warm, personalized weekly health summary for {name}.

Week: {ws.strftime('%d %b')} – {we.strftime('%d %b %Y')}
Conditions: {', '.join(conditions) or 'None'}
Mood average: {avg_mood:.1f}/5
Sleep average: {avg_sleep:.1f} hours/night
Water intake: {avg_water:.0f} ml/day
Exercise: {total_exer} minutes total
Medicine adherence: {adherence}%
Average BP: {avg_bp_sys:.0f} mmHg
Average blood sugar: {avg_sugar:.0f} mg/dL
Vitals logged: {len(vitals)} times
Wellness logged: {len(wellness)} days

Write 2-3 sentences: acknowledge what they did well, note what needs improvement.
Be warm, encouraging, and specific. No generic advice."""

        narrative = await ai_complete(
            "nurse_chat",
            [{"role": "user", "content": narrative_prompt}]
        )

        # ── Highlights & Concerns ──
        analysis_prompt = f"""Based on this patient's weekly data, list highlights and concerns.

Data: mood={avg_mood:.1f}, sleep={avg_sleep:.1f}h, water={avg_water:.0f}ml, exercise={total_exer}min, adherence={adherence}%, bp={avg_bp_sys:.0f}, sugar={avg_sugar:.0f}

Return ONLY valid JSON:
{{
  "highlights": ["specific positive observation 1", "specific positive observation 2"],
  "concerns": ["specific concern 1 if any"],
  "goals_next_week": [
    {{"goal": "specific measurable goal", "reason": "why this matters"}},
    {{"goal": "...", "reason": "..."}},
    {{"goal": "...", "reason": "..."}}
  ]
}}"""

        raw = await ai_complete(
            "deep_reasoning",
            [{"role": "user", "content": analysis_prompt}]
        )
        clean = raw.strip().replace("```json", "").replace("```", "")
        analysis = json.loads(clean)

        # ── Update report record ──
        supabase.table("weekly_reports").update({
            "avg_mood_score":       round(avg_mood, 2),
            "avg_sleep_hours":      round(avg_sleep, 1),
            "avg_water_ml":         round(avg_water),
            "total_exercise_minutes": total_exer,
            "medicine_adherence_pct": adherence,
            "vitals_summary":       vitals_summary,
            "ai_narrative":         narrative,
            "highlights":           analysis.get("highlights", []),
            "concerns":             analysis.get("concerns", []),
            "goals_next_week":      analysis.get("goals_next_week", []),
        }).eq("id", report_id).execute()

        # ── Generate PDF ──
        pdf_url = await generate_pdf_report(report_id, patient_id, name, ws, we, {
            "narrative": narrative, "highlights": analysis.get("highlights", []),
            "concerns": analysis.get("concerns", []), "goals": analysis.get("goals_next_week", []),
            "avg_mood": avg_mood, "avg_sleep": avg_sleep, "avg_water": avg_water,
            "total_exer": total_exer, "adherence": adherence,
            "avg_bp": avg_bp_sys, "avg_sugar": avg_sugar, "conditions": conditions,
        })

        if pdf_url:
            supabase.table("weekly_reports").update({"pdf_url": pdf_url}).eq("id", report_id).execute()

    except Exception as e:
        print(f"[REPORT] Failed to generate report {report_id}: {e}")


async def generate_pdf_report(report_id, patient_id, name, ws, we, data) -> Optional[str]:
    """Generate a simple HTML-to-PDF weekly report."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors as rl_colors
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.units import cm

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=2*cm, bottomMargin=2*cm, leftMargin=2*cm, rightMargin=2*cm)
        styles = getSampleStyleSheet()

        teal = rl_colors.HexColor("#0B8A73")
        coral = rl_colors.HexColor("#E8614D")
        darkTxt = rl_colors.HexColor("#1A3C3A")

        title_style  = ParagraphStyle("title",  parent=styles["Title"],  fontSize=22, textColor=teal, spaceAfter=4)
        h2_style     = ParagraphStyle("h2",     parent=styles["Heading2"],fontSize=13, textColor=teal, spaceBefore=14, spaceAfter=4)
        body_style   = ParagraphStyle("body",   parent=styles["Normal"], fontSize=11, textColor=darkTxt, leading=16)
        bullet_style = ParagraphStyle("bullet", parent=styles["Normal"], fontSize=10, leftIndent=14, textColor=darkTxt)

        story = []

        # Header
        story.append(Paragraph("NovaCare Weekly Health Report", title_style))
        story.append(Paragraph(f"{name}  ·  {ws.strftime('%d %b')} – {we.strftime('%d %b %Y')}", body_style))
        story.append(Spacer(1, 12))

        # Stats table
        stats = [
            ["Metric", "This Week"],
            ["Average Mood",         f"{data['avg_mood']:.1f} / 5"],
            ["Average Sleep",        f"{data['avg_sleep']:.1f} hours/night"],
            ["Daily Water Intake",   f"{data['avg_water']:.0f} ml"],
            ["Exercise",             f"{data['total_exer']} min total"],
            ["Medicine Adherence",   f"{data['adherence']}%"],
            ["Avg Blood Pressure",   f"{data['avg_bp']:.0f} mmHg"],
            ["Avg Blood Sugar",      f"{data['avg_sugar']:.0f} mg/dL"],
        ]
        t = Table(stats, colWidths=[9*cm, 7*cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), teal),
            ("TEXTCOLOR",  (0,0), (-1,0), rl_colors.white),
            ("FONTSIZE",   (0,0), (-1,0), 11),
            ("FONTNAME",   (0,0), (-1,-1), "Helvetica"),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [rl_colors.white, rl_colors.HexColor("#F0FAF8")]),
            ("GRID",       (0,0), (-1,-1), 0.5, rl_colors.HexColor("#D1EDE9")),
            ("PADDING",    (0,0), (-1,-1), 8),
        ]))
        story.append(t)
        story.append(Spacer(1, 16))

        # AI narrative
        story.append(Paragraph("Nova's Summary", h2_style))
        story.append(Paragraph(data["narrative"], body_style))
        story.append(Spacer(1, 10))

        # Highlights
        if data["highlights"]:
            story.append(Paragraph("✅ What Went Well", h2_style))
            for h in data["highlights"]:
                story.append(Paragraph(f"• {h}", bullet_style))
            story.append(Spacer(1, 8))

        # Concerns
        if data["concerns"]:
            story.append(Paragraph("⚠️ Areas to Watch", h2_style))
            for c in data["concerns"]:
                story.append(Paragraph(f"• {c}", bullet_style))
            story.append(Spacer(1, 8))

        # Goals
        if data["goals"]:
            story.append(Paragraph("🎯 Goals for Next Week", h2_style))
            for g in data["goals"]:
                story.append(Paragraph(f"• {g.get('goal', '')}", bullet_style))
                if g.get("reason"):
                    story.append(Paragraph(f"  → {g['reason']}", ParagraphStyle("sub", parent=bullet_style, fontSize=9, textColor=rl_colors.HexColor("#7BBFB5"), leftIndent=24)))

        # Disclaimer
        story.append(Spacer(1, 20))
        story.append(Paragraph(
            "This report is generated by NovaCare AI and is for informational purposes only. "
            "It is not a substitute for professional medical advice. Please share this with your doctor.",
            ParagraphStyle("disclaimer", parent=styles["Normal"], fontSize=8, textColor=rl_colors.gray, alignment=1)
        ))

        doc.build(story)

        # Upload to Supabase Storage
        pdf_bytes = buffer.getvalue()
        path = f"{patient_id}/weekly_{report_id}.pdf"
        supabase.storage.from_("lab-reports").upload(path, pdf_bytes, {"content-type": "application/pdf", "upsert": "true"})
        return supabase.storage.from_("lab-reports").get_public_url(path)

    except Exception as e:
        print(f"[PDF] Generation failed: {e}")
        return None


@router.get("/weekly")
async def list_weekly_reports(user=Depends(get_current_user)):
    res = supabase.table("weekly_reports")\
        .select("*").eq("patient_id", user.id)\
        .order("week_start", desc=True).execute()
    return {"success": True, "data": res.data or [], "error": None}


@router.post("/weekly/{report_id}/share-with-doctor")
async def share_with_doctor(report_id: str, user=Depends(get_current_user)):
    supabase.table("weekly_reports").update({"shared_with_doctor": True})\
        .eq("id", report_id).eq("patient_id", user.id).execute()
    return {"success": True, "data": {"shared": True}, "error": None}
