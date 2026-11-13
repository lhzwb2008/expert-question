"""把一道题的 README.md 转成工作台代填用的 JavaScript。

用法（在 magnet/ 下）：
    python3 代填脚本.py 附件页 04_量化投研与交易_恒指调整
    python3 代填脚本.py 核对 04_量化投研与交易_恒指调整
    python3 代填脚本.py 上传 04_量化投研与交易_恒指调整

附件页、核对：把 JS 写到 /tmp/magnet_<动作>.js，整段作为 Runtime.evaluate 的 expression。
上传：在 127.0.0.1:8765 上临时提供该题的附件包，配合 /tmp/magnet_上传.js 塞进上传框，传完 Ctrl-C。
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
  const r = await fetch('http://127.0.0.1:__PORT__/pack.zip');
  const b = await r.blob();
  const dt = new DataTransfer();
  dt.items.add(new File([b], __ZIP__, { type: 'application/zip' }));
  const inp = document.getElementById('zipInput');
  inp.files = dt.files;
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return '已交给上传框：' + b.size + ' 字节';
})()
"""


def serve(zip_path):
    payload = zip_path.read_bytes()

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
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "application/zip")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

    print(f"在 http://127.0.0.1:{PORT}/ 提供 {zip_path.name}，{len(payload)} 字节。传完 Ctrl-C。", flush=True)
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


def main():
    action, folder = sys.argv[1], ROOT / sys.argv[2]
    data = parse(folder / "README.md")
    data_js = json.dumps(data, ensure_ascii=False)
    if action == "上传":
        js = UPLOAD.replace("__PORT__", str(PORT)).replace("__ZIP__", json.dumps(data["zip"], ensure_ascii=False))
        Path("/tmp/magnet_上传.js").write_text(js.strip(), encoding="utf-8")
        serve(folder / data["zip"])
        return
    template = {"附件页": FILL, "核对": CHECK}[action]
    js = template.replace("__HELPERS__", HELPERS.strip()).replace("__DATA__", data_js).strip()
    out = Path(f"/tmp/magnet_{action}.js")
    out.write_text(js, encoding="utf-8")
    print(f"{out}  {len(js)} 字符；附件 {len(data['attachments'])} 个，交付物 {len(data['deliverables'])} 个")


if __name__ == "__main__":
    main()
