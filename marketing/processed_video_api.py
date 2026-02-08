from __future__ import annotations

import argparse
import json
import sys

from db_manager import DatabaseManager
from models import ProcessedVideo


def _write_json(payload: dict) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print(json.dumps(payload, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description="Processed video API")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list")

    create_parser = sub.add_parser("create")
    create_parser.add_argument("--payload", required=True)

    update_parser = sub.add_parser("update-status")
    update_parser.add_argument("--filename", required=True)
    update_parser.add_argument("--status", required=True)

    args = parser.parse_args()
    manager = DatabaseManager()

    if args.command == "list":
        with manager._session() as session:
            rows = session.execute(
                "SELECT id, client_id, raw_filename, raw_path, processed_path, caption, status, error_message, created_at "
                "FROM processed_videos ORDER BY created_at DESC"
            ).fetchall()
        items = [
            {
                "id": str(row[0]),
                "client_id": str(row[1]),
                "raw_filename": row[2],
                "raw_path": row[3],
                "processed_path": row[4] or "",
                "caption": row[5] or "",
                "status": row[6],
                "error_message": row[7] or "",
                "created_at": row[8].isoformat() if row[8] else "",
            }
            for row in rows
        ]
        _write_json({"items": items})
        return

    if args.command == "create":
        payload = json.loads(args.payload)
        client_id = payload.get("client_id")
        raw_filename = payload.get("raw_filename")
        raw_path = payload.get("raw_path")
        if not client_id or not raw_filename or not raw_path:
            _write_json({"ok": False, "error": "missing required fields"})
            return
        record = manager.create_processed_video(
            client_id=client_id,
            raw_filename=raw_filename,
            raw_path=raw_path,
            processed_path=payload.get("processed_path"),
            caption=payload.get("caption"),
            status=payload.get("status") or "PROCESSED",
            error_message=payload.get("error_message"),
        )
        _write_json({"ok": True, "id": str(record.id)})
        return

    if args.command == "update-status":
        filename = args.filename
        status = args.status
        with manager._session() as session:
            target = (
                session.query(ProcessedVideo)
                .filter(ProcessedVideo.processed_path.ilike(f"%/{filename}"))
                .order_by(ProcessedVideo.created_at.desc())
                .first()
            )
            if not target:
                _write_json({"ok": False, "error": "processed video not found"})
                return
            target.status = status
            session.add(target)
            session.commit()
        _write_json({"ok": True})
        return


if __name__ == "__main__":
    main()
