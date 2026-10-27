FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_MAPBOX_TOKEN=""
ARG VITE_MAPBOX_STYLE=""
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN VITE_MAPBOX_STYLE=$VITE_MAPBOX_STYLE
RUN npm run check && npm run build

FROM python:3.12-slim
WORKDIR /app
COPY pipeline/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import duckdb; c = duckdb.connect(); c.execute(\"SET extension_directory = '/opt/duckdb-extensions'\"); c.execute('INSTALL spatial')" \
 && chmod -R a+rX /opt/duckdb-extensions
COPY pipeline/sts_tiles ./sts_tiles
COPY pipeline/tests ./tests
COPY --from=web /web/dist ./dist
ENV STS_DATA_DIR=/data STS_DUCKDB_EXTENSIONS=/opt/duckdb-extensions PYTHONUNBUFFERED=1
USER 1000:1000
ENTRYPOINT ["python", "-m", "sts_tiles"]
CMD ["run"]
