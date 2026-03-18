import os
from supabase import create_client, Client
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path("services/api/.env"))
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")

supabase: Client = create_client(url, key)
try:
    res = supabase.storage.create_bucket("lab-reports", options={"public": True})
    print("Bucket created:", res)
except Exception as e:
    print("Error creating bucket:", e)
