# syntax=docker/dockerfile:1.7
# ---------- build stage: resolve deps from uv.lock, pre-download the embedding model ----------
FROM python:3.12-slim AS builder
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never \
    PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
RUN pip install uv==0.13.5
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
# Bake the ONNX embedding model (BAAI/bge-small-en-v1.5, 384-d) into the image: fast cold starts,
# no network at runtime.
ENV FASTEMBED_CACHE_PATH=/opt/models
RUN /app/.venv/bin/python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/opt/models')"

# ---------- runtime stage ----------
FROM python:3.12-slim AS runtime
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    FASTEMBED_CACHE_PATH=/opt/models \
    ENV=prod PORT=8080
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin vidya
WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /opt/models /opt/models
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./
RUN chown -R vidya:vidya /opt/models
USER vidya
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request as u; u.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/healthz', timeout=3)"
# One worker per container: Cloud Run scales by instances. Migrations are a separate job:
#   docker run --rm <image> alembic upgrade head
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*' --no-server-header --timeout-graceful-shutdown 25"]
