import httpx
import asyncio
import os

from dotenv import load_dotenv

load_dotenv()
token = ""

async def get_token():
    API = "http://localhost:8000/auth/signup"
    r1 = await httpx.AsyncClient().post(API, json={
        "email": "ai_test@novacare.com", "password": "Password@123",
        "full_name": "AI Test Patient", "role": "patient"
    })
    
    API_SIGNIN = "https://ulwhynsfvmduonmncopo.supabase.co/auth/v1/token?grant_type=password"
    r2 = await httpx.AsyncClient().post(API_SIGNIN, json={"email": "ai_test@novacare.com", "password": "Password@123"}, headers={"apikey": os.environ.get("SUPABASE_ANON_KEY")})
    return r2.json().get("access_token")

async def run():
    t = await get_token()
    print("Token ok.")
    
    API = "http://localhost:8000/ai/chat"
    async with httpx.AsyncClient() as client:
        r = await client.post(API, json={"message": "Hello nurse"}, headers={"Authorization": f"Bearer {t}"})
        print(r.status_code)
        print(r.text)

asyncio.run(run())
