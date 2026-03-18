import httpx, asyncio

async def run():
    API = "http://localhost:8000/auth/signup"
    
    # Patient
    r1 = await httpx.AsyncClient().post(API, json={
        "email": "patient@test.com", "password": "Password@123",
        "full_name": "Test Patient", "role": "patient", "phone": "1234567890"
    })
    print("Patient:", r1.status_code, r1.text)

    # Doctor
    r2 = await httpx.AsyncClient().post(API, json={
        "email": "doctor@test.com", "password": "Password@123",
        "full_name": "Test Doctor", "role": "doctor"
    })
    print("Doctor:", r2.status_code, r2.text)

asyncio.run(run())
