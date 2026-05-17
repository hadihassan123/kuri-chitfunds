from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import get_settings

settings = get_settings()

# Dynamic Database Configuration
# If DATABASE_URL starts with 'sqlite', we apply SQLite-specific arguments
# Otherwise, we treat it as a standard PostgreSQL/other DB connection
if settings.database_url.startswith("sqlite"):
    engine = create_engine(
        settings.database_url, 
        connect_args={"check_same_thread": False}
    )
else:
    # For PostgreSQL, we ensure the URL starts with 'postgresql://' 
    # (Some providers like Heroku/Render use 'postgres://' which SQLAlchemy 1.4+ requires to be 'postgresql://')
    db_url = settings.database_url
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    
    engine = create_engine(db_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
