from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    ENV: str = "development"
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    GROQ_API_KEY: str
    OPENROUTER_API_KEY: str
    GOOGLE_AI_API_KEY: str

    class Config:
        env_file = ".env"

settings = Settings()
