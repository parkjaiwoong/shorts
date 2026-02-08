from __future__ import annotations

import argparse
import json
import sys

from db_manager import DatabaseManager
from models import Base


def _write_json(payload: dict) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    print(json.dumps(payload, ensure_ascii=False))


def _serialize_client(client) -> dict:
    return {
        "id": str(client.id),
        "name": client.name,
        "phone": client.phone or "",
        "location": client.location or "",
        "default_cta": client.default_cta or "",
        "created_at": client.created_at.isoformat() if client.created_at else "",
        "updated_at": client.updated_at.isoformat() if client.updated_at else "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Client CRUD API")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list")

    create_parser = sub.add_parser("create")
    create_parser.add_argument("--payload", required=True)

    update_parser = sub.add_parser("update")
    update_parser.add_argument("--client-id", required=True)
    update_parser.add_argument("--payload", required=True)

    delete_parser = sub.add_parser("delete")
    delete_parser.add_argument("--client-id", required=True)

    args = parser.parse_args()
    manager = DatabaseManager()
    # Ensure new tables exist for client MVP.
    Base.metadata.create_all(manager.engine)

    if args.command == "list":
        clients = manager.list_clients()
        _write_json({"clients": [_serialize_client(client) for client in clients]})
        return

    if args.command == "create":
        payload = json.loads(args.payload)
        name = (payload.get("name") or "").strip()
        if not name:
            _write_json({"ok": False, "error": "name is required"})
            return
        client = manager.create_client(
            name=name,
            phone=payload.get("phone") or None,
            location=payload.get("location") or None,
            default_cta=payload.get("default_cta") or None,
        )
        _write_json({"ok": True, "client": _serialize_client(client)})
        return

    if args.command == "update":
        payload = json.loads(args.payload)
        client = manager.update_client(
            args.client_id,
            name=payload.get("name"),
            phone=payload.get("phone"),
            location=payload.get("location"),
            default_cta=payload.get("default_cta"),
        )
        if not client:
            _write_json({"ok": False, "error": "client not found"})
            return
        _write_json({"ok": True, "client": _serialize_client(client)})
        return

    if args.command == "delete":
        ok = manager.delete_client(args.client_id)
        if not ok:
            _write_json({"ok": False, "error": "client not found"})
            return
        _write_json({"ok": True})


if __name__ == "__main__":
    main()
