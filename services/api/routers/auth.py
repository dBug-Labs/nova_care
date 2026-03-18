from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr
from supabase import create_client
from config import settings
from dependencies import get_current_user
from typing import Optional

router = APIRouter()
import asyncio
from supabase.client import ClientOptions

# Increase timeout to prevent 'read operation timed out'
opts = ClientOptions(postgrest_client_timeout=30)
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY, options=opts)


class SignUpRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str  # 'patient' or 'doctor'
    phone: Optional[str] = None

class SignInRequest(BaseModel):
    email: EmailStr
    password: str

class DoctorSignUpExtra(BaseModel):
    specialty: str
    registration_number: str
    hospital_name: Optional[str] = None


def do_signup(req: SignUpRequest):
    # Create Supabase auth user
    res = supabase.auth.admin.create_user({
        "email": req.email,
        "password": req.password,
        "email_confirm": True,  # auto-confirm for hackathon
        "user_metadata": {"full_name": req.full_name, "role": req.role}
    })
    user_id = res.user.id

    # Create profile record
    supabase.table("profiles").insert({
        "id": user_id,
        "role": req.role,
        "full_name": req.full_name,
        "phone": req.phone,
    }).execute()

    # Create role-specific profile stub
    if req.role == "patient":
        supabase.table("patient_profiles").insert({"id": user_id}).execute()
    elif req.role == "doctor":
        supabase.table("doctor_profiles").insert({
            "id": user_id,
            "specialty": "general",
            "registration_number": f"PENDING_{user_id[:8]}"
        }).execute()
    return user_id


@router.post("/signup")
async def sign_up(req: SignUpRequest):
    try:
        # Run synchronous blocking calls in a thread pool to avoid blocking the FastAPI event loop
        user_id = await asyncio.to_thread(do_signup, req)
        return {"success": True, "data": {"user_id": user_id}, "error": None}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/complete-doctor-profile")
async def complete_doctor_profile(req: DoctorSignUpExtra, user=Depends(get_current_user)):
    """Update doctor profile with full details after initial signup."""
    try:
        supabase.table("doctor_profiles").update({
            "specialty": req.specialty,
            "registration_number": req.registration_number,
            "hospital_name": req.hospital_name,
        }).eq("id", user.id).execute()
        return {"success": True, "data": None, "error": None}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
