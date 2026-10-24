FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import duckdb; c = duckdb.connect(); c.execute(\"SET extension_directory = '/opt/duckdb-extensions'\"); c.execute('INSTALL spatial')" \
 && chmod -R a+rX /opt/duckdb-extensions
COPY sts_tiles ./sts_tiles
COPY tests ./tests
ENV STS_DATA_DIR=/data STS_DUCKDB_EXTENSIONS=/opt/duckdb-extensions PYTHONUNBUFFERED=1
USER 1000:1000
ENTRYPOINT ["python", "-m", "sts_tiles"]
CMD ["run"]
