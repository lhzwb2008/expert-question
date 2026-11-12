#!/usr/bin/env python3
"""不依赖 MCP SDK 的最小客户端：用 Streamable HTTP 直接调用远程 MCP 服务，并把原始返回存成文件。

系统自带的 Python 3.9 装不了官方 MCP SDK，所以这里用标准库按协议发 JSON-RPC。
它走的就是 MCP 协议本身：initialize → tools/list → tools/call。

用法：
  python3 mcp_call.py list <服务名>
  python3 mcp_call.py call <服务名> <工具名> '<JSON 参数>' [--save 输出文件.json]

服务名见下面的 SERVERS，也可以直接写 URL。
--save 会把查询时间、服务地址、工具名、参数和原始返回一起写进文件，可以直接当作 MCP 结果文件。
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.error
import urllib.request

SERVERS = {
    "stockmcp": "https://stockmcp.leoguerin.fr/mcp",
    "us-stocks": "https://mcp-stocks-us.gino.im/mcp",
    "marketcrew": "https://marketcrew.ai/mcp",
    "statcite": "https://statcite.com/mcp",
    "imf": "https://imf.caseyjhand.com/mcp",
    "econdash": "https://mcp.econdash.org/mcp",
}
PROTOCOL = "2025-03-26"


class Mcp:
    def __init__(self, url: str, headers: dict | None = None):
        self.url = url
        self.headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream",
                        "User-Agent": "expert-question-mcp-call/0.1"}
        self.headers.update(headers or {})
        self.session = None
        self.n = 0

    def _post(self, body: dict, timeout: int = 60):
        h = dict(self.headers)
        if self.session:
            h["Mcp-Session-Id"] = self.session
        req = urllib.request.Request(self.url, data=json.dumps(body).encode(), headers=h, method="POST")
        try:
            res = urllib.request.urlopen(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            raise SystemExit(f"HTTP {e.code} {self.url}: {e.read().decode(errors='replace')[:400]}")
        sid = res.headers.get("Mcp-Session-Id")
        if sid:
            self.session = sid
        raw = res.read().decode(errors="replace")
        if "text/event-stream" in (res.headers.get("Content-Type") or ""):
            out = None
            for line in raw.splitlines():
                if line.startswith("data:"):
                    try:
                        msg = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    if "id" in msg and ("result" in msg or "error" in msg):
                        out = msg
            return out
        return json.loads(raw) if raw.strip() else None

    def rpc(self, method: str, params: dict | None = None):
        self.n += 1
        body = {"jsonrpc": "2.0", "id": self.n, "method": method}
        if params is not None:
            body["params"] = params
        msg = self._post(body)
        if msg is None:
            raise SystemExit(f"{method} 没有返回")
        if "error" in msg:
            raise SystemExit(f"{method} 出错: {json.dumps(msg['error'], ensure_ascii=False)[:600]}")
        return msg["result"]

    def start(self) -> dict:
        info = self.rpc("initialize", {"protocolVersion": PROTOCOL, "capabilities": {},
                                       "clientInfo": {"name": "expert-question", "version": "0.1"}})
        try:
            self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        except SystemExit:
            pass
        return info


def main() -> None:
    if len(sys.argv) < 3 or sys.argv[1] not in ("list", "call"):
        raise SystemExit(__doc__)
    name = sys.argv[2]
    url = SERVERS.get(name, name)
    c = Mcp(url)
    info = c.start()
    server = info.get("serverInfo", {})
    if sys.argv[1] == "list":
        print(f"{name}  {url}  服务端: {server.get('name')} {server.get('version')}")
        for t in c.rpc("tools/list").get("tools", []):
            req = t.get("inputSchema", {}).get("required", [])
            props = list(t.get("inputSchema", {}).get("properties", {}).keys())
            print(f"  - {t['name']}  必填{req}  参数{props}")
            print(f"      {(t.get('description') or '').strip().splitlines()[0][:160] if t.get('description') else ''}")
        return
    tool = sys.argv[3]
    args = json.loads(sys.argv[4]) if len(sys.argv) > 4 and not sys.argv[4].startswith("--") else {}
    when = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).strftime("%Y-%m-%d %H:%M:%S 北京时间")
    result = c.rpc("tools/call", {"name": tool, "arguments": args})
    record = {"查询时间": when, "MCP服务地址": url, "MCP服务端": server, "工具": tool, "参数": args, "原始返回": result}
    if "--save" in sys.argv:
        path = sys.argv[sys.argv.index("--save") + 1]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=1)
        print(f"已保存 {path}")
    text = "\n".join(x.get("text", "") for x in result.get("content", []) if x.get("type") == "text")
    print(text[:3000] if text else json.dumps(result, ensure_ascii=False)[:3000])


if __name__ == "__main__":
    main()
