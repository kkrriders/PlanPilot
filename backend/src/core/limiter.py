from fastapi import Request
from slowapi import Limiter


def _get_real_ip(request: Request) -> str:
    """Return the real client IP, honouring X-Forwarded-For for proxy deployments."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first (leftmost) address — the actual client
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_get_real_ip)
