from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from dependencies import get_current_user, supabase

router = APIRouter()


def require_doctor(user):
    """Check that the current user has role='doctor'. Raise 403 if not."""
    # user is a Supabase User object; get role from profiles table
    try:
        profile = supabase.table("profiles").select("role").eq("id", user.id).single().execute()
        if not profile.data or profile.data.get("role") != "doctor":
            raise HTTPException(status_code=403, detail="Doctor access required")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=403, detail="Doctor access required")


@router.get("/patients")
async def get_patients(user=Depends(get_current_user)):
    """Get all patients linked to this doctor, sorted by risk level."""
    require_doctor(user)

    # Get linked patient IDs
    links = supabase.table("doctor_patient_links") \
        .select("patient_id") \
        .eq("doctor_id", user.id) \
        .eq("active", True) \
        .execute()

    patient_ids = [l["patient_id"] for l in links.data] if links.data else []

    if not patient_ids:
        return {"success": True, "data": []}

    # Get patient profiles with latest vitals
    patients = []
    for pid in patient_ids:
        try:
            # Get profile
            profile = supabase.table("profiles").select("full_name").eq("id", pid).single().execute()
            p_profile = supabase.table("patient_profiles") \
                .select("blood_group,chronic_conditions,bmi") \
                .eq("id", pid).single().execute()

            # Get latest vitals
            vitals = supabase.table("vitals_logs") \
                .select("systolic_bp,diastolic_bp,blood_sugar_fasting,risk_level,flagged,created_at") \
                .eq("patient_id", pid) \
                .order("created_at", desc=True) \
                .limit(1).execute()

            latest = vitals.data[0] if vitals.data else {}

            patients.append({
                "id": pid,
                "name": profile.data.get("full_name", "") if profile.data else "",
                "blood_group": p_profile.data.get("blood_group") if p_profile.data else None,
                "chronic_conditions": p_profile.data.get("chronic_conditions", []) if p_profile.data else [],
                "bmi": p_profile.data.get("bmi") if p_profile.data else None,
                "risk_level": latest.get("risk_level", "normal"),
                "flagged": latest.get("flagged", False),
                "latest_bp": f"{latest.get('systolic_bp','?')}/{latest.get('diastolic_bp','?')}" if latest.get("systolic_bp") else None,
                "latest_sugar": latest.get("blood_sugar_fasting"),
                "last_vitals_at": latest.get("created_at"),
            })
        except Exception as e:
            print(f"[DOCTOR] Error fetching patient {pid}: {e}")

    # Sort by risk level (critical first)
    risk_order = {"critical": 0, "warning": 1, "watch": 2, "normal": 3}
    patients.sort(key=lambda p: risk_order.get(p.get("risk_level", "normal"), 4))

    return {"success": True, "data": patients}


@router.get("/patients/{patient_id}")
async def get_patient_detail(patient_id: str, user=Depends(get_current_user)):
    """Get full patient detail — all 6 sections."""
    require_doctor(user)

    # Verify doctor is linked to this patient
    link = supabase.table("doctor_patient_links") \
        .select("id") \
        .eq("doctor_id", user.id) \
        .eq("patient_id", patient_id) \
        .eq("active", True) \
        .execute()

    if not link.data:
        raise HTTPException(status_code=404, detail="Patient not linked to you")

    # 1. Profile
    profile = supabase.table("profiles").select("*").eq("id", patient_id).single().execute()
    p_profile = supabase.table("patient_profiles").select("*").eq("id", patient_id).single().execute()

    # 2. Vitals (last 7 days)
    vitals = supabase.table("vitals_logs") \
        .select("*") \
        .eq("patient_id", patient_id) \
        .order("created_at", desc=True) \
        .limit(20).execute()

    # 3. Wellness
    wellness = supabase.table("wellness_logs") \
        .select("*") \
        .eq("patient_id", patient_id) \
        .order("log_date", desc=True) \
        .limit(7).execute()

    # 4. Labs
    labs = supabase.table("lab_reports") \
        .select("id,report_type,report_date,overall_status,ai_summary,ai_flags,created_at") \
        .eq("patient_id", patient_id) \
        .order("created_at", desc=True) \
        .limit(10).execute()

    # 5. Medicines
    medicines = supabase.table("medicines") \
        .select("*") \
        .eq("patient_id", patient_id) \
        .eq("active", True) \
        .execute()

    # 6. Chats (session summaries)
    chats = supabase.table("chat_sessions") \
        .select("id,session_type,title,summary,mood_detected,started_at,message_count") \
        .eq("patient_id", patient_id) \
        .order("started_at", desc=True) \
        .limit(10).execute()

    return {
        "success": True,
        "data": {
            "profile": {**(profile.data or {}), **(p_profile.data or {})},
            "vitals": vitals.data or [],
            "wellness": wellness.data or [],
            "labs": labs.data or [],
            "medicines": medicines.data or [],
            "chats": chats.data or [],
        }
    }


class NoteRequest(BaseModel):
    patient_id: str
    note: str
    note_type: Optional[str] = "general"


@router.post("/notes")
async def add_note(req: NoteRequest, user=Depends(get_current_user)):
    """Doctor adds a clinical note to a patient."""
    require_doctor(user)

    res = supabase.table("doctor_notes").insert({
        "doctor_id": user.id,
        "patient_id": req.patient_id,
        "note": req.note,
        "note_type": req.note_type,
    }).execute()

    return {"success": True, "data": res.data[0] if res.data else {}}


@router.get("/notes/{patient_id}")
async def get_notes(patient_id: str, user=Depends(get_current_user)):
    """Get all notes for a patient by this doctor."""
    require_doctor(user)

    res = supabase.table("doctor_notes") \
        .select("*") \
        .eq("doctor_id", user.id) \
        .eq("patient_id", patient_id) \
        .order("created_at", desc=True) \
        .execute()

    return {"success": True, "data": res.data or []}
