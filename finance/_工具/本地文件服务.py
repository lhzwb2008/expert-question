#!/usr/bin/env python3
"""填表时给浏览器页面喂本地文件：只监听 127.0.0.1，根目录是 finance/，带 CORS 和私有网络访问头。

用法：python3 本地文件服务.py [端口，默认 8765]
"""
from __future__ import annotations

import http.server
import sys
from functools import partial
from pathlib import Path

FIN = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=str(FIN)))
    print(f"serving {FIN} on http://127.0.0.1:{port}", flush=True)
    srv.serve_forever()
