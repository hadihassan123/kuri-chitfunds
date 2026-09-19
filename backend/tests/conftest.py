import os


# Configure deterministic test settings before application modules are imported.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_ci.db")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
