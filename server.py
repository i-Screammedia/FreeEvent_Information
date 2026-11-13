# -*- coding: utf-8 -*-
"""안내 페이지와 공유 문의 게시판을 함께 제공합니다."""
import json
import os
import secrets
import threading
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
BOARD = os.path.join(DATA, "board.json")
CONFIG = os.path.join(DATA, "config.json")
LOCK = threading.Lock()
KST = timezone(timedelta(hours=9))
MAX_POSTS = 1000
MAX_TEXT = 2000


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path, payload):
    temporary = path + ".tmp"
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    os.replace(temporary, path)


def ensure():
    os.makedirs(DATA, exist_ok=True)
    created = False
    if not os.path.exists(CONFIG):
        save_json(CONFIG, {"adminPassword": secrets.token_urlsafe(9)})
        created = True
    if not os.path.exists(BOARD):
        save_json(BOARD, {"posts": []})
    return created


def mask_name(name):
    chars = list(name.strip())
    if len(chars) <= 1:
        return "*"
    if len(chars) == 2:
        return chars[0] + "*"
    return chars[0] + ("*" * (len(chars) - 2)) + chars[-1]


def public_post(post):
    return {
        "id": post["id"],
        "question": post.get("question") or "",
        "author": mask_name(post.get("name") or "") if (post.get("name") or "").strip() else "",
        "createdAt": post.get("createdAt") or "",
        "answer": post.get("answer") or "",
        "answeredAt": post.get("answeredAt") or "",
    }


def full_post(post):
    item = public_post(post)
    item["office"] = post.get("office") or ""
    item["school"] = post.get("school") or ""
    item["name"] = post.get("name") or ""
    item["phone"] = post.get("phone") or ""
    item["sAccount"] = post.get("sAccount") or ""
    item["privateNote"] = post.get("privateNote") or ""
    return item


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/data"):
            self.send_error(404)
            return
        if path == "/api/board":
            self.send_board(False)
            return
        if path == "/":
            self.path = "/index.html"
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/board":
            self.create_post()
            return
        if path == "/api/board/answer":
            self.save_answer()
            return
        if path == "/api/board/admin":
            self.send_board(True)
            return
        self.send_error(404)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > 20000:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def password_ok(self, body):
        config = load_json(CONFIG, {})
        return str((body or {}).get("password") or "") == str(config.get("adminPassword") or "")

    def send_board(self, admin):
        body = self.read_body() if admin else {}
        if admin and not self.password_ok(body):
            self.send_json(403, {"error": "비밀번호가 맞지 않습니다."})
            return
        with LOCK:
            board = load_json(BOARD, {"posts": []})
        mapper = full_post if admin else public_post
        posts = [mapper(post) for post in board.get("posts", [])]
        posts.sort(key=lambda post: post["createdAt"], reverse=True)
        self.send_json(200, {"posts": posts})

    def create_post(self):
        body = self.read_body()
        if not isinstance(body, dict):
            self.send_json(400, {"error": "내용을 확인해 주세요."})
            return
        if bool(body.get("agree")):
            self.send_json(400, {"error": "개인정보가 포함된 문의는 게시판에 남길 수 없습니다."})
            return
        question = str(body.get("question") or "").strip()
        if len(question) < 5 or len(question) > MAX_TEXT:
            self.send_json(400, {"error": "문의는 5자 이상 2,000자 이내로 남겨 주세요."})
            return
        post = {
            "id": secrets.token_hex(8),
            "office": "",
            "school": "",
            "sAccount": "",
            "name": "",
            "phone": "",
            "question": question,
            "privateNote": "",
            "createdAt": datetime.now(KST).isoformat(timespec="minutes"),
            "answer": "",
            "answeredAt": "",
        }
        with LOCK:
            board = load_json(BOARD, {"posts": []})
            posts = board.get("posts", [])
            posts.append(post)
            board["posts"] = posts[-MAX_POSTS:]
            save_json(BOARD, board)
        self.send_json(201, {"post": public_post(post)})

    def save_answer(self):
        body = self.read_body()
        if not isinstance(body, dict):
            self.send_json(400, {"error": "내용을 확인해 주세요."})
            return
        if not self.password_ok(body):
            self.send_json(403, {"error": "비밀번호가 맞지 않습니다."})
            return
        answer = str(body.get("answer") or "").strip()
        post_id = str(body.get("id") or "")
        if not answer or len(answer) > MAX_TEXT:
            self.send_json(400, {"error": "답변을 입력해 주세요."})
            return
        with LOCK:
            board = load_json(BOARD, {"posts": []})
            found = None
            for post in board.get("posts", []):
                if post.get("id") == post_id:
                    post["answer"] = answer
                    post["answeredAt"] = datetime.now(KST).isoformat(timespec="minutes")
                    found = post
                    break
            if not found:
                self.send_json(404, {"error": "문의를 찾지 못했습니다."})
                return
            save_json(BOARD, board)
        self.send_json(200, {"post": public_post(found)})


if __name__ == "__main__":
    created = ensure()
    port = int(os.environ.get("PORT", "8787"))
    print("안내 페이지: http://127.0.0.1:%d/" % port)
    if created:
        print("답변 비밀번호를 data/config.json 에 새로 만들었습니다.")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
