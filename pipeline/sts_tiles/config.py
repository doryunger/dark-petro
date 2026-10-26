import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Config:
    bucket: str
    findings_prefix: str
    data_dir: Path
    keep_builds: int
    region: str | None
    port: int
    app_dir: Path
    extension_dir: str
    duckdb_memory: str
    watch_s: float
    sanctioned_prefix: str = "sanctioned/"

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            bucket=os.environ.get("STS_BUCKET") or os.environ.get("S3_BUCKET_NAME", ""),
            findings_prefix=os.environ.get("STS_FINDINGS_PREFIX", "sts/"),
            data_dir=Path(os.environ.get("STS_DATA_DIR", "/data")),
            keep_builds=int(os.environ.get("STS_KEEP_BUILDS", "5")),
            region=os.environ.get("AWS_REGION") or None,
            port=int(os.environ.get("STS_PORT", "8080")),
            app_dir=Path(os.environ.get("STS_APP_DIR", "/app/dist")),
            extension_dir=os.environ.get("STS_DUCKDB_EXTENSIONS", "/opt/duckdb-extensions"),
            duckdb_memory=os.environ.get("STS_DUCKDB_MEMORY", "200MB"),
            watch_s=float(os.environ.get("STS_WATCH_S", "5")),
            sanctioned_prefix=os.environ.get("STS_SANCTIONED_PREFIX", "sanctioned/"),
        )

    @property
    def prefixes(self) -> tuple[str, str]:
        return self.findings_prefix, self.sanctioned_prefix

    @property
    def mirror(self) -> Path:
        return self.data_dir / "mirror"

    @property
    def builds(self) -> Path:
        return self.data_dir / "builds"

    @property
    def current(self) -> Path:
        return self.data_dir / "current"

    @property
    def state_file(self) -> Path:
        return self.data_dir / "state.json"

    @property
    def captures_state_file(self) -> Path:
        return self.data_dir / "captures_state.json"

    @property
    def status_file(self) -> Path:
        return self.data_dir / "status.json"
