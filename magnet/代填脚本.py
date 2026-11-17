"""把一道题的 README.md 变成工作台代填用的 JavaScript，并在本机临时提供给页面。

用法（放后台跑，用完结束进程）：
    python3 magnet/代填脚本.py 02_量化投研与交易_恒指调整

页面里按路径取，每次请求都重新读 README：
    /pack.zip   附件包
    /upload.js  把附件包交给上传框
    /fill.js    填附件页其余字段
    /check.js   核对附件页与 README 是否一致
    /query.js   填 Query 页

取到的文本在页面里用 (0, eval)(text) 执行，返回值是一句结果。
"""

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8765

TEXT_FIELDS = {
    "具体岗位": "role",
    "预计任务耗时（分钟）": "duration",
    "任务范围与口径": "scope",
    "业务背景": "context",
    "任务目的": "purpose",
    "具体任务要求": "requirements",
    "整体要求": "dlvOverall",
}
DLV_TYPES = {"文档": "文字文档", "表格": "表格", "PDF": "PDF", "演示文稿": "演示文稿", "图片": "图片"}


def blocks(text):
    return [b.strip("\n") for b in re.findall(r"```[^\n]*\n(.*?)```", text, re.S)]


def parse(readme):
    md = readme.read_text(encoding="utf-8")
    data = {"fields": {}, "attachments": [], "deliverables": [], "zip": None, "query": None}
    for sec in re.split(r"^### ", md, flags=re.M)[1:]:
        head, _, body = sec.partition("\n")
        head = head.strip()
        code = blocks(body)
        if head == "附件包":
            data["zip"] = code[0]
        elif head in TEXT_FIELDS:
            data["fields"][TEXT_FIELDS[head]] = code[0]
        elif head == "附件清单":
            for line in body.splitlines():
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                if len(cells) == 3 and cells[0] not in ("文件", "---"):
                    data["attachments"].append({"name": cells[0], "acc": cells[1], "cat": cells[2]})
        elif head.startswith("交付物"):
            _, kind, ext = head.split("｜")
            data["deliverables"].append(
                {"type": DLV_TYPES[kind], "ext": ext.lstrip("."), "name": code[0], "req": code[1]}
            )
        elif head == "Query":
            data["query"] = code[0]
    return data


HELPERS = r"""
const lab = o => { const m = o.querySelector('.opt-main'); return (m ? m.childNodes[0].textContent : o.innerText).replace(/\s+/g, ' ').trim(); };
const pick = (sel, label, byValue) => {
  const hit = [...sel.querySelectorAll('.select-option')].find(o => byValue ? o.dataset.value === label : lab(o) === label);
  if (!hit) return 'MISS ' + label;
  hit.click();
  return 'ok';
};
const setv = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
"""

FILL = r"""
(() => {
  const D = __DATA__;
  __HELPERS__
  const log = [];
  for (const [id, v] of Object.entries(D.fields)) setv(document.getElementById(id), v);
  const names = [...document.querySelectorAll('.name-select .select-trigger')].map(t => t.innerText.trim());
  for (const a of D.attachments) {
    const i = names.indexOf(a.name);
    if (i < 0) { log.push('清单里没有 ' + a.name); continue; }
    log.push(pick(document.querySelectorAll('.acc-select .select')[i], a.acc));
    log.push(pick(document.querySelectorAll('.cat-select .select')[i], a.cat));
  }
  if (names.length !== D.attachments.length) log.push('清单行数 ' + names.length + '，README 列了 ' + D.attachments.length);
  while (document.querySelectorAll('.dlv-row').length < D.deliverables.length) document.getElementById('btnAddDlv').click();
  D.deliverables.forEach((d, i) => {
    const row = () => document.querySelectorAll('.dlv-row')[i];
    log.push(pick(row().querySelector('.dlv-type .select'), d.type));
    log.push(pick(row().querySelector('.dlv-ext-select .select'), d.ext, true));
    setv(row().querySelector('.dlv-name'), d.name);
    setv(row().querySelector('.dlv-req'), d.req);
  });
  const bad = log.filter(x => x !== 'ok');
  return bad.length ? bad.join('\n') : '全部填好：' + log.length + ' 个下拉';
})()
"""

CHECK = r"""
(() => {
  const D = __DATA__;
  const diff = [];
  for (const [id, v] of Object.entries(D.fields)) if (document.getElementById(id).value !== v) diff.push('字段 ' + id);
  const rows = [...document.querySelectorAll('.name-select')].map((n, i) => ({
    name: n.querySelector('.select-trigger').innerText.trim(),
    acc: document.querySelectorAll('.acc-select .select-trigger')[i].innerText.trim(),
    cat: document.querySelectorAll('.cat-select .select-trigger')[i].innerText.trim(),
  }));
  for (const a of D.attachments) {
    const r = rows.find(x => x.name === a.name);
    if (!r || r.acc !== a.acc || r.cat !== a.cat) diff.push('附件 ' + a.name + ' → ' + JSON.stringify(r));
  }
  const dl = [...document.querySelectorAll('.dlv-row')];
  if (dl.length !== D.deliverables.length) diff.push('交付物行数 ' + dl.length);
  D.deliverables.forEach((d, i) => {
    const r = dl[i];
    if (!r) return;
    const got = [r.querySelector('.dlv-name').value, r.querySelector('.dlv-type .select-trigger').innerText.trim(),
                 r.querySelector('.dlv-ext-select .select-trigger').innerText.trim(), r.querySelector('.dlv-req').value];
    const want = [d.name, d.type, '.' + d.ext, d.req];
    if (got.join('|') !== want.join('|')) diff.push('交付物 ' + (i + 1) + ' → ' + JSON.stringify(got));
  });
  return diff.length ? diff.join('\n') : '与 README 一致';
})()
"""

UPLOAD = r"""
(async () => {
  const b = await (await fetch('http://127.0.0.1:__PORT__/pack.zip')).blob();
  const dt = new DataTransfer();
  dt.items.add(new File([b], __ZIP__, { type: 'application/zip' }));
  const inp = document.getElementById('zipInput');
  inp.files = dt.files;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return '已交给上传框：' + b.size + ' 字节';
})()
"""

QUERY = r"""
(() => {
  const Q = __QUERY__;
  const ta = document.getElementById('queryText');
  ta.value = Q;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new Event('change', { bubbles: true }));
  const r = document.querySelector('input[name="query-reference"][value="Q1"]');
  r.click();
  r.dispatchEvent(new Event('change', { bubbles: true }));
  const ref = document.querySelector('input[name="query-reference"]:checked').value;
  return (ta.value === Q && ref === 'Q1' ? '已填好' : '不一致') + '：' + ta.value.length + ' 字，参考=' + ref;
})()
"""


def build(folder, path):
    data = parse(folder / "README.md")
    dump = lambda v: json.dumps(v, ensure_ascii=False)
    if path == "/pack.zip":
        return (folder / data["zip"]).read_bytes()
    if path == "/upload.js":
        js = UPLOAD.replace("__PORT__", str(PORT)).replace("__ZIP__", dump(data["zip"]))
    elif path == "/fill.js":
        js = FILL.replace("__HELPERS__", HELPERS.strip()).replace("__DATA__", dump(data))
    elif path == "/check.js":
        js = CHECK.replace("__DATA__", dump(data))
    elif path == "/query.js":
        js = QUERY.replace("__QUERY__", dump(data["query"]))
    else:
        return None
    return js.strip().encode("utf-8")


def main():
    folder = ROOT / sys.argv[1]

    class Handler(BaseHTTPRequestHandler):
        def cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Headers", "*")

        def do_OPTIONS(self):
            self.send_response(204)
            self.cors()
            self.end_headers()

        def do_GET(self):
            body = build(folder, self.path.split("?")[0])
            self.send_response(200 if body is not None else 404)
            self.cors()
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(body or b"")))
            self.end_headers()
            self.wfile.write(body or b"")

        def log_message(self, *args):
            pass

    print(f"http://127.0.0.1:{PORT}/ 提供 {folder.name}。用完结束进程。", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
