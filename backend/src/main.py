import logging
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from src.core.limiter import limiter
from src.core.config import get_settings
from src.routes import auth, plans, tasks, execution, drift, analytics
from src.routes import team, simulation, users

settings = get_settings()
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(plans.router, prefix="/api/v1")
app.include_router(tasks.router, prefix="/api/v1")
app.include_router(execution.router, prefix="/api/v1")
app.include_router(drift.router, prefix="/api/v1")
app.include_router(analytics.router, prefix="/api/v1")
app.include_router(team.router, prefix="/api/v1")
app.include_router(simulation.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": settings.app_name}


@app.get("/readiness")
async def readiness():
    from src.core.database import engine
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        return {"status": "ready"}
    except Exception:
        logger.error("Readiness check failed", exc_info=True)
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail="Service not ready")
