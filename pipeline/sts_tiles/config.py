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

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            bucket=os.environ.get("STS_BUCKET") or os.environ.get("S3_BUCKET_NAME", ""),
            findings_prefix=os.environ.get("STS_FINDINGS_PREFIX", "sts/"),
            data_dir=Path(os.environ.get("STS_DATA_DIR", "/data")),
            keep_builds=int(os.environ.get("STS_KEEP_BUILDS", "5")),
            region=os.environ.get("AWS_REGION") or None,
        )

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
    def status_file(self) -> Path:
        return self.data_dir / "status.json"
