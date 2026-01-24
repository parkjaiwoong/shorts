import os
from urllib.parse import quote_plus

import psycopg2
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text

from models import Base


load_dotenv()


def _get_env_value(*keys: str) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None


def _get_database_config() -> dict[str, str]:
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return {"database_url": database_url}

    host = _get_env_value("DB_HOST", "RDS_HOSTNAME")
    port = _get_env_value("DB_PORT", "RDS_PORT") or "5432"
    name = _get_env_value("DB_NAME", "RDS_DB_NAME")
    user = _get_env_value("DB_USER", "RDS_USERNAME")
    password = _get_env_value("DB_PASSWORD", "RDS_PASSWORD")

    missing = [key for key, value in {
        "DB_HOST": host,
        "DB_NAME": name,
        "DB_USER": user,
        "DB_PASSWORD": password,
    }.items() if not value]
    if missing:
        raise RuntimeError(
            "DB 연결 정보를 찾을 수 없습니다. "
            "DATABASE_URL 또는 DB_HOST/DB_NAME/DB_USER/DB_PASSWORD(또는 RDS_* 변수를) 설정하세요."
        )

    return {
        "host": host,
        "port": port,
        "name": name,
        "user": user,
        "password": password,
    }


def _build_sqlalchemy_url(config: dict[str, str]) -> str:
    database_url = config.get("database_url")
    if database_url:
        return database_url

    user = config["user"]
    password = quote_plus(config["password"])
    host = config["host"]
    port = config["port"]
    name = config["name"]
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}"


def _connect_with_psycopg2(config: dict[str, str]) -> None:
    database_url = config.get("database_url")
    if database_url:
        psycopg2_dsn = database_url.replace("postgresql+psycopg2://", "postgresql://", 1)
        with psycopg2.connect(psycopg2_dsn):
            return

    with psycopg2.connect(
        host=config["host"],
        port=config["port"],
        dbname=config["name"],
        user=config["user"],
        password=config["password"],
    ):
        return


def main() -> None:
    config = _get_database_config()
    _connect_with_psycopg2(config)
    engine = create_engine(_build_sqlalchemy_url(config), pool_pre_ping=True)
    Base.metadata.create_all(engine)
    _ensure_pipeline_status_enum(engine)
    _ensure_product_columns(engine)
    _ensure_video_asset_columns(engine)
    _ensure_channel_columns(engine)
    _ensure_upload_log_columns(engine)
    print("DB connection ok. Tables initialized.")


def _ensure_product_columns(engine) -> None:
    inspector = inspect(engine)
    if "products" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("products")}
    alter_statements: list[str] = []

    if "affiliate_url" not in existing:
        alter_statements.append("ADD COLUMN affiliate_url TEXT")
    if "status" not in existing:
        alter_statements.append(
            "ADD COLUMN status VARCHAR(60) DEFAULT 'READY_TO_DOWNLOAD' NOT NULL"
        )
    if "origin_site" not in existing:
        alter_statements.append("ADD COLUMN origin_site VARCHAR(120)")
    if "track" not in existing:
        alter_statements.append("ADD COLUMN track VARCHAR(20) DEFAULT 'AUTO' NOT NULL")
    if "collected_date" not in existing:
        alter_statements.append(
            "ADD COLUMN collected_date VARCHAR(8) DEFAULT '19700101' NOT NULL"
        )

    if not alter_statements:
        return

    statement = "ALTER TABLE products " + ", ".join(alter_statements)
    with engine.begin() as conn:
        conn.execute(text(statement))


def _ensure_video_asset_columns(engine) -> None:
    inspector = inspect(engine)
    if "video_assets" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("video_assets")}
    alter_statements: list[str] = []

    if "channel_id" not in existing:
        alter_statements.append("ADD COLUMN channel_id UUID")

    if not alter_statements:
        return

    statement = "ALTER TABLE video_assets " + ", ".join(alter_statements)
    with engine.begin() as conn:
        conn.execute(text(statement))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_video_assets_channel_id "
                "ON video_assets (channel_id)"
            )
        )
        has_fk = conn.execute(
            text(
                "SELECT 1 FROM pg_constraint "
                "WHERE conname = 'fk_video_assets_channel'"
            )
        ).first()
        if not has_fk:
            conn.execute(
                text(
                    "ALTER TABLE video_assets "
                    "ADD CONSTRAINT fk_video_assets_channel "
                    "FOREIGN KEY (channel_id) REFERENCES channels (id)"
                )
            )


def _ensure_pipeline_status_enum(engine) -> None:
    desired = [
        "COLLECTING",
        "COLLECTED",
        "EDITING",
        "READY",
        "PROCESSED",
        "UPLOADED",
        "COMPLETED",
        "ERROR",
    ]
    with engine.begin() as conn:
        existing = conn.execute(
            text(
                "SELECT enumlabel "
                "FROM pg_enum "
                "JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
                "WHERE typname = 'pipelinestatus'"
            )
        ).fetchall()
        if not existing:
            return
        existing_values = {row[0] for row in existing}
        for value in desired:
            if value not in existing_values:
                conn.execute(
                    text(f"ALTER TYPE pipelinestatus ADD VALUE '{value}'")
                )


def _ensure_upload_log_columns(engine) -> None:
    inspector = inspect(engine)
    if "upload_logs" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("upload_logs")}
    alter_statements: list[str] = []

    if "next_retry_at" not in existing:
        alter_statements.append("ADD COLUMN next_retry_at TIMESTAMPTZ")

    if not alter_statements:
        return

    statement = "ALTER TABLE upload_logs " + ", ".join(alter_statements)
    with engine.begin() as conn:
        conn.execute(text(statement))


def _ensure_channel_columns(engine) -> None:
    inspector = inspect(engine)
    if "channels" not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns("channels")}
    alter_statements: list[str] = []

    if "subtitle_style" not in existing:
        alter_statements.append(
            "ADD COLUMN subtitle_style VARCHAR(20) DEFAULT 'BOTH' NOT NULL"
        )
    if "tone" not in existing:
        alter_statements.append(
            "ADD COLUMN tone VARCHAR(20) DEFAULT 'INFORMAL' NOT NULL"
        )
    if "hashtag_template" not in existing:
        alter_statements.append("ADD COLUMN hashtag_template TEXT")
    if "title_prefix" not in existing:
        alter_statements.append("ADD COLUMN title_prefix VARCHAR(80)")

    if not alter_statements:
        return

    statement = "ALTER TABLE channels " + ", ".join(alter_statements)
    with engine.begin() as conn:
        conn.execute(text(statement))


if __name__ == "__main__":
    main()
