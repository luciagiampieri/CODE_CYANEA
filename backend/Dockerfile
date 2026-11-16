FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY pyproject.toml README.md ./
COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

EXPOSE 8000

# WEB_CONCURRENCY define la cantidad de workers de uvicorn. Por defecto 1: el
# ConnectionManager de WebSocket y los schedulers viven en memoria de cada proceso,
# asi que con mas de un worker los eventos en tiempo real no llegan a los sockets
# conectados a otro worker y los schedulers corren duplicados.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-1}"]