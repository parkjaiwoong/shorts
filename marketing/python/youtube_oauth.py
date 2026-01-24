# youtube_oauth.py

from __future__ import annotations

import argparse
import os
import pickle
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate YouTube OAuth token.")
    parser.add_argument(
        "--token-path",
        default="token.pickle",
        help="Output token path (default: token.pickle)",
    )
    parser.add_argument(
        "--client-secrets",
        default="client_secret.json",
        help="Client secrets JSON path",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite token if it already exists",
    )
    args = parser.parse_args()

    token_path = Path(args.token_path)
    if token_path.exists() and not args.force:
        print(f"이미 인증됨 ({token_path} 존재)")
        return

    if not Path(args.client_secrets).exists():
        raise SystemExit(f"client secrets not found: {args.client_secrets}")

    flow = InstalledAppFlow.from_client_secrets_file(
        args.client_secrets,
        SCOPES,
    )
    creds = flow.run_local_server(port=0)

    token_path.parent.mkdir(parents=True, exist_ok=True)
    with open(token_path, "wb") as f:
        pickle.dump(creds, f)

    print(f"OAuth 인증 완료! {token_path} 생성됨")


if __name__ == "__main__":
    main()
