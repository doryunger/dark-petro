FROM python:3.12-slim AS tippecanoe
RUN apt-get update && apt-get install -y --no-install-recommends build-essential git ca-certificates libsqlite3-dev zlib1g-dev \
 && rm -rf /var/lib/apt/lists/*
ARG TIPPECANOE_VERSION=2.79.0
RUN git clone --depth 1 --branch ${TIPPECANOE_VERSION} https://github.com/felt/tippecanoe.git /src \
 && make -C /src -j2 tippecanoe tile-join && cp /src/tippecanoe /src/tile-join /usr/local/bin/

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-0 zlib1g libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=tippecanoe /usr/local/bin/tippecanoe /usr/local/bin/tile-join /usr/local/bin/
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY sts_tiles ./sts_tiles
COPY tests ./tests
ENV STS_DATA_DIR=/data PYTHONUNBUFFERED=1
USER 1000:1000
ENTRYPOINT ["python", "-m", "sts_tiles"]
CMD ["run"]
