import httpx, asyncio

async def run():
    API = "http://localhost:8000/auth/signup"
    
    # Patient
    r1 = await httpx.AsyncClient().post(API, json={
        "email": "patient_demo@novacare.com", "password": "Password@123",
        "full_name": "Demo Patient", "role": "patient", "phone": "1234567890"
    })
    print("Patient:", r1.status_code, r1.text)

    # Doctor
    r2 = await httpx.AsyncClient().post(API, json={
        "email": "doctor_demo@novacare.com", "password": "Password@123",
        "full_name": "Demo Doctor", "role": "doctor"
    })
    print("Doctor:", r2.status_code, r2.text)

asyncio.run(run())
