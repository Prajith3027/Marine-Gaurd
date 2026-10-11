# ─────────────────────────────────────────────
# AI Oil Spill Intelligence — Backend Dockerfile
# Production-ready, non-root container
# ─────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Install essential runtime libraries for PostgreSQL and healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated non-root application user
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup -s /bin/bash -m appuser

WORKDIR /app

# Install Python dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY app /app/app

# Ensure runtime directories for uploads exist with correct permissions
RUN mkdir -p /app/uploads/reports /app/models && \
    chown -R appuser:appgroup /app/uploads /app/models

# Switch to non-root user
USER appuser

# Expose internal API port
EXPOSE 8000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Launch single-worker Uvicorn (enforcing process-local rate limiting safety)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
