import os
import uuid
from dotenv import load_dotenv
from supabase.client import create_client, ClientOptions

load_dotenv()
opts = ClientOptions(postgrest_client_timeout=30)
supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"), options=opts)

def test_user(name):
    print(f"\n--- Testing {name} ---")
    try:
        r = supabase.table("profiles").select("*").eq("full_name", name).execute()
        if not r.data:
            print("Not found in profiles")
            return
        uid = r.data[-1]["id"]
        print("User ID:", uid)
        
        r2 = supabase.table("patient_profiles").select("*").eq("id", uid).execute()
        print("In patient_profiles:", len(r2.data) > 0)
        
        supabase.table("chat_sessions").insert({
            "id": str(uuid.uuid4()),
            "patient_id": uid,
            "session_type": "general"
        }).execute()
        print("Insert chat_sessions: SUCCESS")
    except Exception as e:
        print("Insert chat_sessions: FAIL", e)

test_user("Demo Patient")
test_user("Demo Doctor")
