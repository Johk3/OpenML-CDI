# ─────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────
FROM node:25-slim AS frontend-builder

# Enable corepack to use pnpm without a manual npm install
RUN npm install -g pnpm@latest

# Set pnpm home for the cache to work correctly
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app/frontend

# Copy package manifests and install config first
COPY frontend/package.json frontend/pnpm-lock.yaml* frontend/pnpm-workspace.yaml* frontend/.npmrc* frontend/package-lock.json* ./

# Automatically detect package manager and install deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    if [ -f pnpm-lock.yaml ]; then \
      pnpm fetch --frozen-lockfile && \
      pnpm install --frozen-lockfile --offline; \
    elif [ -f package-lock.json ]; then \
      npm ci --include=dev; \
    else \
      echo "No lockfile found. Supported: pnpm-lock.yaml or package-lock.json" && exit 1; \
    fi

COPY frontend/ ./
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm run build; \
    elif [ -f package-lock.json ]; then \
      npm run build; \
    fi


# ─────────────────────────────────────────────
# Stage 2: Install Python dependencies
# ─────────────────────────────────────────────
FROM python:3.14-slim AS python-builder

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt


# ─────────────────────────────────────────────
# Stage 3: Final production image
# ─────────────────────────────────────────────
FROM python:3.14-slim AS production

WORKDIR /

# Copy installed Python packages from builder stage
COPY --from=python-builder /install /usr/local

# Copy FastAPI application code
COPY app/ ./app
COPY alembic.ini ./alembic.ini
COPY alembic/ ./alembic

# Copy React build output into a 'static' folder served by FastAPI
COPY --from=frontend-builder /app/frontend/dist ./app/static

# Non-root user for security
RUN mkdir -p /data && \
    adduser --disabled-password --gecos "" appuser && \
    chown -R appuser:appuser /data
USER appuser

EXPOSE 8000

# Declare /data as a mountable volume
VOLUME ["/data"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
