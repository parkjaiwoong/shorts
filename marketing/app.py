import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import BackgroundTasks, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from downloader import run_collect
from main import VideoMonetizer


TASKS_PATH = Path("tasks.json")


class CollectRequest(BaseModel):
    urls: List[str]
    affiliate_link: str


def _load_tasks():
    if not TASKS_PATH.exists():
        return {}
    return json.loads(TASKS_PATH.read_text(encoding="utf-8"))


def _save_tasks(tasks):
    TASKS_PATH.write_text(
        json.dumps(tasks, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _update_task(task_id: str, patch: dict):
    tasks = _load_tasks()
    current = tasks.get(task_id, {})
    current.update(patch)
    tasks[task_id] = current
    _save_tasks(tasks)


def _process_task(task_id: str, urls: List[str], affiliate_link: str):
    _update_task(
        task_id,
        {"status": "collecting", "updated_at": datetime.utcnow().isoformat() + "Z"},
    )
    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
    run_collect(urls, affiliate_link, user_agent)
    _update_task(
        task_id,
        {"status": "processing", "updated_at": datetime.utcnow().isoformat() + "Z"},
    )
    VideoMonetizer().process_all()
    _update_task(
        task_id,
        {"status": "done", "updated_at": datetime.utcnow().isoformat() + "Z"},
    )


app = FastAPI(title="Partners Automation")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/partners/collect")
def collect(request: CollectRequest, background_tasks: BackgroundTasks):
    task_id = uuid.uuid4().hex
    _update_task(
        task_id,
        {
            "status": "queued",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "urls": request.urls,
        },
    )
    background_tasks.add_task(_process_task, task_id, request.urls, request.affiliate_link)
    return {"task_id": task_id}


@app.get("/partners/status/{task_id}")
def status(task_id: str):
    tasks = _load_tasks()
    return tasks.get(task_id, {"status": "not_found"})
