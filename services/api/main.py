import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from config import settings
from routers import auth, patients, vitals, ai_nurse, lab_reports, reminders, doctors, reports_export

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"🚀 NovaCare API starting — env: {settings.ENV}")
    yield
    print("NovaCare API shutting down")

app = FastAPI(
    title="NovaCare API",
    version="1.0.0",
    description="AI-powered universal healthcare platform",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include all routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(patients.router, prefix="/patients", tags=["patients"])
app.include_router(vitals.router, prefix="/vitals", tags=["vitals"])
app.include_router(ai_nurse.router, prefix="/ai", tags=["ai-nurse"])
app.include_router(lab_reports.router, prefix="/labs", tags=["lab-reports"])
app.include_router(reminders.router, prefix="/reminders", tags=["reminders"])
app.include_router(doctors.router, prefix="/doctors", tags=["doctors"])
app.include_router(reports_export.router, prefix="/reports-export", tags=["reports-export"])

@app.get("/health")
async def health(): return {"status": "ok", "service": "NovaCare API"}
