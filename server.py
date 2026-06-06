from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import request, error
import json


ROOT = Path(__file__).resolve().parent
PORT = 5173


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

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/chat/completions":
            self.send_error(404, "Not Found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            target_url = payload["targetUrl"]
            api_request = payload["request"]
            body = json.dumps(api_request["body"], ensure_ascii=False).encode("utf-8")
            headers = dict(api_request.get("headers") or {})
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
    print(f"AI Novel Script Tool: http://127.0.0.1:{PORT}/index.html?v=2026-06-06-mimo")
    server.serve_forever()
