from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request, error
import json
from api_secret import decode_secret


ROOT = Path(__file__).resolve().parent
PORT = 5173
API_CONFIG_FILE = ROOT / "api-config.json"
API_SECRET_FILE = ROOT / "api-secret.enc"
PROTECTED_PATHS = {"/api-config.json", "/api-secret.enc"}


def build_chat_completions_url(base_url):
    trimmed = str(base_url or "").strip().rstrip("/")
    if not trimmed:
        raise ValueError("api-config.json 缺少 baseUrl。")
    if trimmed.lower().endswith("/chat/completions"):
        return trimmed
    return f"{trimmed}/chat/completions"


def is_protected_path(path):
    return path.split("?", 1)[0].split("#", 1)[0] in PROTECTED_PATHS


def load_api_config(path=API_CONFIG_FILE, secret_path=API_SECRET_FILE):
    if not Path(path).exists():
        return {
            "baseUrl": "",
            "apiKey": "",
            "keySource": "missing",
            "model": "",
            "authHeader": "bearer",
            "maxChapters": 0,
            "requestBody": {},
        }

    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    request_body = raw.get("requestBody") or {}

    if not isinstance(request_body, dict):
        raise ValueError("api-config.json 的 requestBody 必须是对象。")

    user_api_key = str(raw.get("apiKey") or "").strip()
    bundled_api_key = ""
    key_source = "user-config" if user_api_key else "missing"

    if not user_api_key and Path(secret_path).exists():
        try:
            bundled_api_key = decode_secret(Path(secret_path).read_text(encoding="utf-8"))
            key_source = "bundled-default"
        except (OSError, UnicodeError, ValueError):
            bundled_api_key = ""

    return {
        "baseUrl": str(raw.get("baseUrl") or "").strip(),
        "apiKey": user_api_key or bundled_api_key,
        "keySource": key_source,
        "model": str(raw.get("model") or "").strip(),
        "authHeader": str(raw.get("authHeader") or "bearer").strip() or "bearer",
        "maxChapters": normalize_max_chapters(raw.get("maxChapters")),
        "requestBody": request_body,
    }


def normalize_max_chapters(value):
    try:
        max_chapters = int(value)
    except (TypeError, ValueError):
        return 0

    return max_chapters if max_chapters > 0 else 0


def public_api_config_status(config):
    configured = bool(
        config.get("baseUrl")
        and config.get("apiKey")
        and config.get("model")
    )
    status = {
        "configured": configured,
        "baseUrl": config.get("baseUrl") or "",
        "model": config.get("model") or "",
        "authHeader": config.get("authHeader") or "bearer",
        "maxChapters": normalize_max_chapters(config.get("maxChapters")),
        "hasApiKey": bool(config.get("apiKey")),
        "keySource": config.get("keySource") or "missing",
    }

    if configured:
        status["message"] = "API 配置已加载。"
    else:
        status["message"] = "API 配置不完整，请提供用户 API Key 或 api-secret.enc。"

    return status


def build_configured_upstream_request(config, messages):
    if not config.get("apiKey"):
        raise ValueError("缺少用户 API Key 或可用的 api-secret.enc。")
    if not config.get("model"):
        raise ValueError("api-config.json 缺少 model。")

    headers = {"Content-Type": "application/json"}
    auth_header = str(config.get("authHeader") or "bearer").strip().lower()

    if auth_header == "api-key":
        headers["api-key"] = config["apiKey"]
    else:
        headers["Authorization"] = f"Bearer {config['apiKey']}"

    body = {
        "model": config["model"],
        "temperature": 0.2,
        "messages": messages,
    }
    body.update(config.get("requestBody") or {})

    return build_chat_completions_url(config.get("baseUrl")), headers, body


class ToolHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        requested = path.split("?", 1)[0].split("#", 1)[0].lstrip("/")
        safe_path = (ROOT / requested).resolve()
        if not str(safe_path).startswith(str(ROOT)):
            return str(ROOT / "index.html")
        return str(safe_path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if is_protected_path(self.path):
            self.send_error(404, "Not Found")
            return

        if self.path.split("?", 1)[0] != "/api/config":
            super().do_GET()
            return

        try:
            data = json.dumps(
                public_api_config_status(load_api_config()),
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            data = json.dumps(
                {"error": {"message": f"读取 API 配置失败：{exc}"}},
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(data)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/chat/completions":
            self.send_error(404, "Not Found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))

            if "targetUrl" in payload and "request" in payload:
                target_url = payload["targetUrl"]
                api_request = payload["request"]
                headers = dict(api_request.get("headers") or {})
                upstream_body = api_request["body"]
            else:
                target_url, headers, upstream_body = build_configured_upstream_request(
                    load_api_config(),
                    payload.get("messages") or [],
                )

            body = json.dumps(upstream_body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
            upstream_request = request.Request(
                target_url,
                data=body,
                headers=headers,
                method="POST",
            )

            with request.urlopen(upstream_request, timeout=120) as upstream:
                data = upstream.read()
                self.send_response(upstream.status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(data)
        except error.HTTPError as exc:
            data = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            data = json.dumps(
                {"error": {"message": f"本地代理请求失败：{exc}"}},
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(data)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), ToolHandler)
    print(f"AI Novel Script Tool: http://127.0.0.1:{PORT}/index.html?v=2026-06-07-summary")
    server.serve_forever()
