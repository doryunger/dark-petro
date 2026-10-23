FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY sts_tiles ./sts_tiles
COPY tests ./tests
ENV STS_DATA_DIR=/data PYTHONUNBUFFERED=1
USER 1000:1000
ENTRYPOINT ["python", "-m", "sts_tiles"]
CMD ["run"]
