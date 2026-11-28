#!/usr/bin/env python3
"""最终质检要求的模型试跑：准备跑题目录，跑完以后核对并整理每题四样交付物。

  python3 试跑.py prepare [--附件说明]   # 生成 ~/workspace/finance-试跑/<对话>/
  python3 试跑.py check                  # 核对已经跑完的对话
  python3 试跑.py collect                # 整理成 ~/workspace/finance-试跑/交付/<题号>_<名称>/ 四样文件

跑题目录在仓库外面，每个对话一个文件夹，在 Kiro 里单独作为工作区打开。里面只有题面（发送内容）和题目附件，
没有标准答案、标准答案附件、考点，也没有仓库里的其他文件。

`--附件说明`：把「题目附件说明」接在题面后面一起发。会议说「只给题面和题目附件」，默认不带；
11、12、14 等 17 道题的题面写了「其他材料见附件说明」，要不要带由用户定。

跑完以后，每个对话文件夹里放：
  导出/      Kiro 聊天标签右键「Export Chat」得到的 zip（不解压也行）
  截图/      完整对话截图，png 或 jpg，按顺序命名
  产物/第NN题/  模型自己保存的交付文件（跑的时候模型就写在这里）
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIN = HERE.parent
RUN = Path.home() / "workspace" / "finance-试跑"
CHAINS = [(1,), (2,), (3,), (4,), (5,), (6,), (7,), (8,), (9,), (10,), (11,), (12,),
          (13, 14, 15), (16, 17, 18), (19, 20, 21), (22, 23), (24, 25), (26, 27), (28, 29, 30)]
CHAIN_NAME = {13: "港股红利", 16: "专户", 19: "雪球", 22: "ADR", 24: "美股专户", 26: "两融", 28: "定增"}
MCP_JSON = {"mcpServers": {"us-stocks": {"url": "https://mcp-stocks-us.gino.im/mcp", "disabled": False,
                                         "autoApprove": ["get_historical_stock_prices", "get_stock_info"]}}}
# 这些字样出现在 trace 里，说明模型碰到了不该看的东西
FORBIDDEN = ["expert-question", "标准答案附件", "③填写稿", "考点"]


def tx():
    s = importlib.util.spec_from_file_location("填写稿", HERE / "填写稿.py")
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


def conv_name(chain: tuple[int, ...]) -> str:
    t = tx()
    if len(chain) == 1:
        return t.folder(chain[0]).name
    return f"{chain[0]:02d}-{chain[-1]:02d}_{CHAIN_NAME[chain[0]]}"


def expected_tickers(n: int) -> list[str]:
    d = tx().folder(n) / "MCP结果文件"
    return sorted({json.load(open(p, encoding="utf-8"))["参数"]["ticker"] for p in d.glob("*.json")})


def prompt(n: int, chain: tuple[int, ...], with_note: bool) -> str:
    f = tx().parse(n)
    lines = [f"【第{n:02d}题】", "", f["body"], ""]
    if with_note:
        lines += ["题目附件说明：", "", f["attach_note"], ""]
    lines.append(f"本题附件在工作区的 `第{n:02d}题_附件/` 文件夹里。")
    lines.append("题面要求的在线查询，请直接调用本对话里已连接的 US Stocks MCP 工具完成，不要另写程序访问 MCP 接口。")
    i = chain.index(n)
    if i:
        prev = "、".join(f"`产物/第{m:02d}题/`" for m in chain[:i])
        lines.append(f"你在前面几轮完成的文件在 {prev}。")
    lines.append(f"请把本题要交的文件保存到 `产物/第{n:02d}题/`。")
    return "\n".join(lines) + "\n"


def prepare(with_note: bool) -> None:
    RUN.mkdir(parents=True, exist_ok=True)
    t = tx()
    for chain in CHAINS:
        root = RUN / conv_name(chain)
        for sub in ("导出", "截图"):
            (root / sub).mkdir(parents=True, exist_ok=True)
        (root / ".kiro" / "settings").mkdir(parents=True, exist_ok=True)
        json.dump(MCP_JSON, open(root / ".kiro" / "settings" / "mcp.json", "w"), indent=2)
        for n in chain:
            att = root / f"第{n:02d}题_附件"
            if att.exists():
                shutil.rmtree(att)
            # 手册：MCP 留底文件即使已传到收题表，也不能给模型
            shutil.copytree(t.folder(n) / "题目附件", att, ignore=shutil.ignore_patterns(".*", "*_MCP_*"))
            (root / "产物" / f"第{n:02d}题").mkdir(parents=True, exist_ok=True)
            (root / f"第{n:02d}题_发送内容.md").write_text(prompt(n, chain, with_note), encoding="utf-8")
        # 自查：跑题目录里不能有任何一道题的标答文件（按内容比，不看文件名）
        import hashlib
        h = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
        ans = {h(p) for d in (FIN / "题目").iterdir() if d.is_dir() for p in (d / "标准答案附件").iterdir()}
        mcp = {h(p) for d in (FIN / "题目").iterdir() if d.is_dir() for p in (d / "MCP结果文件").glob("*")}
        for p in root.rglob("*"):
            if p.is_file():
                assert h(p) not in ans, ("跑题目录里有标答文件", p)
                assert h(p) not in mcp and "_MCP_" not in p.name, ("跑题目录里有 MCP 留底文件", p)
        print(f"{root.name}: {len(chain)} 题，附件 " + "、".join(
            str(len(list((root / f'第{n:02d}题_附件').iterdir()))) for n in chain))
    print(f"\n跑题目录：{RUN}（附件说明：{'带' if with_note else '不带'}）")


# ---------- 跑完以后 ----------

def load_trace(root: Path):
    """读 Kiro 导出的 zip（或已解压的文件夹），返回 (session, messages, 原始文件 {名字: bytes})。"""
    zs = sorted((root / "导出").glob("*.zip"))
    raw = {}
    if zs:
        with zipfile.ZipFile(zs[-1]) as z:
            raw = {i: z.read(i) for i in z.namelist() if not i.endswith("/")}
    else:
        for p in (root / "导出").rglob("*"):
            if p.is_file():
                raw[str(p.relative_to(root / "导出"))] = p.read_bytes()
    if not any(k.endswith("messages.jsonl") for k in raw):
        # 没放 Export Chat 的 zip：直接读 Kiro 本机的会话文件（内容和 Export Chat 一样）
        try:
            sd = session_dir(root)
        except AssertionError:
            return None, [], {}
        raw = {f"{sd.name}/{f.relative_to(sd)}": f.read_bytes() for f in sd.rglob("*") if f.is_file()}
    sess = next((json.loads(b) for k, b in raw.items() if k.endswith("session.json")), None)
    msgs = []
    for k, b in sorted(raw.items()):
        if k.endswith(".jsonl") and "sub-executions" not in k:
            msgs += [json.loads(x) for x in b.decode("utf-8").splitlines() if x.strip()]
    return sess, msgs, raw


def pl(m: dict) -> dict:
    """Kiro 的每条记录是 {"id", "timestamp", "payload": {"type": ...}}。"""
    return m.get("payload", m)


def split_rounds(msgs: list[dict], chain: tuple[int, ...]):
    """按用户消息里的「【第NN题】」把对话切成每题一段。"""
    marks = {}
    for i, m in enumerate(msgs):
        p = pl(m)
        if p.get("type") == "user":
            for n in chain:
                if f"【第{n:02d}题】" in str(p.get("content", "")) and n not in marks:
                    marks[n] = i
    seg, order = {}, sorted(marks.items(), key=lambda kv: kv[1])
    for j, (n, i) in enumerate(order):
        seg[n] = msgs[i:order[j + 1][1] if j + 1 < len(order) else len(msgs)]
    return seg


def reply_text(seg: list[dict]) -> str:
    """模型正文：这一轮里 operationType 为 Say 的 assistant 消息，不含思考过程。"""
    return "\n\n".join(str(pl(m).get("content", "")).strip() for m in seg
                        if pl(m).get("type") == "assistant" and pl(m).get("operationType") == "Say"
                        and str(pl(m).get("content", "")).strip())


def mcp_calls(seg: list[dict]) -> list[dict]:
    """这一轮里真正调用 US Stocks MCP get_historical_stock_prices 的记录（带参数和是否成功）。"""
    res = {pl(m).get("toolCallId"): pl(m) for m in seg if pl(m).get("type") == "tool_result"}
    out = []
    for m in seg:
        p = pl(m)
        if p.get("type") != "tool_call":
            continue
        a = p.get("args") or {}
        tid = str(a.get("tool_id", "")) if isinstance(a, dict) else ""
        name = str(p.get("toolName", ""))
        key = (tid + " " + name).lower().replace("_", "-")
        # 题面点名的 US Stocks MCP 工具都算（06 用 get_stock_info，其余用 get_historical_stock_prices）
        if ("us-stocks" in key or "usstocks" in key) and ("get-historical-stock-prices" in key or "get-stock-info" in key):
            args = a.get("arguments", a) if isinstance(a, dict) else {}
            r = res.get(p.get("toolCallId"), {})
            out.append({"ticker": str((args or {}).get("ticker", "")), "ok": r.get("success") is True,
                        "result": str(r.get("content", ""))[:200]})
    return out


def check_conv(chain: tuple[int, ...]) -> dict:
    root = RUN / conv_name(chain)
    res = {"对话": root.name, "问题": []}
    sess, msgs, raw = load_trace(root)
    if not msgs:
        res["问题"].append("导出/ 里没有 Kiro 导出的 zip 或 messages.jsonl")
        return res
    if sess:
        res["模型"] = f"{sess.get('modelId')} effort={sess.get('effortLevel')}"
        if "opus-5" not in str(sess.get("modelId", "")) and "opus-6" not in str(sess.get("modelId", "")):
            res["问题"].append(f"模型是 {sess.get('modelId')}，会议要求 Opus 5.5 及以上")
        if str(sess.get("effortLevel", "")).lower() not in ("high", "xhigh", "max", "ultra"):
            res["问题"].append(f"推理档位是 {sess.get('effortLevel')}，要求 High 或以上")
        ws = [str(x) for x in sess.get("workspacePaths", [])]
        if ws and not all(str(root) in w or root.name in w for w in ws):
            res["问题"].append(f"工作区是 {ws}，应当只打开 {root}")
    # 模型碰没碰仓库和标答：只看工具调用的参数和结果，不看题面本身
    tool_blob = json.dumps([pl(m) for m in msgs if pl(m).get("type") in ("tool_call", "tool_result")], ensure_ascii=False)
    for w in FORBIDDEN:
        if w in tool_blob:
            res["问题"].append(f"工具调用里出现「{w}」，确认模型有没有读到仓库或标答")
    left = [p.name for n in chain for p in (root / f"第{n:02d}题_附件").glob("*_MCP_*")]
    if left:
        res["问题"].append(f"附件里有 MCP 留底文件 {left}，手册不许给模型，删掉后整个对话重跑")
    if "_MCP_" in tool_blob:
        res["问题"].append("工具调用里出现「_MCP_」，模型读过 MCP 留底文件，整个对话重跑")
    seg = split_rounds(msgs, chain)
    cut = next((i for i, m in enumerate(msgs) if pl(m).get("type") == "user" and TRACE_MARK in str(pl(m).get("content", ""))), len(msgs))
    seg_ans = split_rounds(msgs[:cut], chain)
    for n, sg in seg_ans.items():
        ids = sorted({pl(m).get("reasoningModelId") for m in sg if pl(m).get("reasoningModelId")})
        if ids and ids != ["qdev::claude-opus-5.5"]:
            res["问题"].append(f"第{n:02d}题答题轮用到的模型是 {ids}，答题必须全程是 Opus 5.5，整个对话重跑")
        if any(pl(m).get("key") == "modelFallback" for m in sg):
            res["问题"].append(f"第{n:02d}题答题轮发生了模型回退，整个对话重跑")
    if cut == len(msgs):
        res["问题"].append("还没有发 trace 导出提示词")
    for n in chain:
        if n not in seg:
            res["问题"].append(f"第{n:02d}题：对话里找不到「【第{n:02d}题】」那条发送内容")
            continue
        calls = mcp_calls(seg[n])
        if not calls:
            res["问题"].append(f"第{n:02d}题：这一轮没有通过 US Stocks MCP 工具当场调用（用 Python 直接访问接口不算）")
        got = {c["ticker"] for c in calls if c["ok"]}
        miss = [tk for tk in expected_tickers(n) if tk not in got]
        if calls and miss:
            res["问题"].append(f"第{n:02d}题：没有成功查询这些代码：{'、'.join(miss)}（实际查了 {sorted(got)}）。"
                               "题面没要求查的可以忽略，请对照题面确认")
        out = [p for p in (root / "产物" / f"第{n:02d}题").rglob("*") if p.is_file() and not p.name.startswith(".")]
        if not out:
            res["问题"].append(f"第{n:02d}题：产物/第{n:02d}题/ 是空的")
        if not reply_text(seg[n]) and not (root / "回复" / f"第{n:02d}题.md").exists():
            res["问题"].append(f"第{n:02d}题：从 trace 里取不到模型正文，请手工把正文存成 回复/第{n:02d}题.md")
    if not [p for p in (root / "截图").iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg")]:
        res["问题"].append("截图/ 是空的")
    return res


def check() -> list[dict]:
    allres = []
    for chain in CHAINS:
        root = RUN / conv_name(chain)
        if not load_trace(root)[1]:
            print(f"[未跑] {root.name}")
            continue
        r = check_conv(chain)
        allres.append(r)
        print(f"[{'通过' if not r['问题'] else '有问题'}] {r['对话']} {r.get('模型', '')}")
        for x in r["问题"]:
            print("    ", x)
    return allres


def collect() -> None:
    """check 通过的对话逐个用 pack 整理成交付文件夹（读 Kiro 会话文件和模型导出的 trace，含 trace_补充.json）。"""
    for chain in CHAINS:
        root = RUN / conv_name(chain)
        if not load_trace(root)[1]:
            continue
        r = check_conv(chain)
        if r["问题"]:
            print(f"[跳过] {root.name}：先处理 check 列出的问题")
            continue
        try:
            pack(chain)
        except AssertionError as e:
            print(f"[跳过] {root.name}：{e}")
    print(f"\n交付目录：{RUN / '交付'}")


# ---------- 2026-11-26 实际跑法：直接读 Kiro 存的会话，模型自己导出 trace.json ----------

TRACE_MARK = "导出为可下载的 trace.json"


def session_dir(root: Path) -> Path:
    """找 workspacePaths 指向这个对话文件夹的 Kiro 会话（最新的一个）。"""
    hits = []
    for sj in (Path.home() / ".kiro" / "sessions").glob("*/sess_*/session.json"):
        try:
            s = json.load(open(sj, encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if str(root) in [str(x) for x in s.get("workspacePaths", [])]:
            hits.append((s.get("createdAt", ""), sj.parent))
    # 只认这次 prepare 之后开的会话：同名文件夹以前跑过（已挪到 _作废/）的旧会话不算
    import datetime as _dt
    made = min(f.stat().st_mtime for f in root.glob("第*题_发送内容.md"))
    since = _dt.datetime.fromtimestamp(made, _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    hits = [h for h in hits if h[0] >= since]
    assert hits, f"找不到 {root} 这次 prepare 之后的 Kiro 会话"
    return sorted(hits)[-1][1]


def is_trace(f: Path) -> bool:
    return f.name.startswith(("trace.json", "trace_补充", "trace-evidence")) and f.suffix in (".json", ".zip")


def runtime_meta(sd: Path, msgs: list[dict], chain) -> dict:
    """从 Kiro 会话文件里摘出模型身份和 MCP 调用的原生记录（不含系统提示词和思考正文），作为 trace 的旁证。"""
    sess = json.load(open(sd / "session.json", encoding="utf-8"))
    keep = {k: sess.get(k) for k in ("id", "title", "agentMode", "workspacePaths", "createdAt", "lastModifiedAt",
                                     "modelId", "modelNamedBy", "effortLevel", "contextSnapshotModelDisplay")}
    rounds, cur, out = [], None, []
    for m in msgs:
        p = pl(m)
        if p.get("type") == "user" and not (p.get("_meta", {}).get("kiro", {}).get("syntheticUserMessageReason")):
            c = str(p.get("content", ""))
            cur = next((f"第{n:02d}题" for n in chain if f"【第{n:02d}题】" in c), "trace导出补充" if "trace_补充" in c
                       else "trace导出" if TRACE_MARK in c else "其他")
            rounds.append({"轮": cur, "用户消息时间": m.get("timestamp"), "模型ID": set(), "回退": []})
        if not rounds:
            continue
        if p.get("reasoningModelId"):
            rounds[-1]["模型ID"].add(p["reasoningModelId"])
        if p.get("key") == "modelFallback":
            rounds[-1]["回退"].append({"时间": m.get("timestamp"), **p.get("value", {})})
        if p.get("type") == "tool_call":
            a = p.get("args") or {}
            if "us-stocks" in str(a.get("tool_id", "")):
                out.append({"轮": cur, "call_id": p.get("toolCallId"), "时间": m.get("timestamp"),
                            "工具": a.get("tool_id"), "参数": a.get("arguments")})
        if p.get("type") == "tool_result":
            for o in out:
                if o["call_id"] == p.get("toolCallId"):
                    o["返回时间"] = m.get("timestamp")
                    o["成功"] = p.get("success")
                    o["返回节选"] = str(p.get("content", ""))[:300]
    for r in rounds:
        r["模型ID"] = sorted(r["模型ID"])
    return {"说明": "由 Kiro IDE 本机会话文件（~/.kiro/sessions/.../session.json、messages.jsonl）原样摘出：会话设置、"
                    "每轮思考记录上的 reasoningModelId、模型回退记录、US Stocks MCP 调用的原生 call_id/时间/参数/返回节选。"
                    "不含系统提示词和思考正文。session.json 的 modelId 是会话最后一次的设置。",
            "session.json": keep, "各轮模型": rounds, "US Stocks MCP 调用": out}


def pack(chain: tuple[int, ...]) -> None:
    t = tx()
    root = RUN / conv_name(chain)
    sd = session_dir(root)
    sess = json.load(open(sd / "session.json", encoding="utf-8"))
    msgs = [json.loads(x) for x in (sd / "messages.jsonl").read_text(encoding="utf-8").splitlines() if x.strip()]
    cut = next((i for i, m in enumerate(msgs) if pl(m).get("type") == "user" and TRACE_MARK in str(pl(m).get("content", ""))), None)
    assert cut is not None, "还没有发 trace 导出提示词"
    seg = split_rounds(msgs[:cut], chain)
    meta = runtime_meta(sd, msgs, chain)
    traces = sorted(f for f in root.rglob("*") if f.is_file() and is_trace(f) and "_附件" not in str(f))
    assert traces, "找不到模型导出的 trace 文件"
    shots = sorted((root / "截图").glob("*.png")) + sorted((root / "截图" / "完整对话").glob("*.png"))
    probs = []
    for r in meta["各轮模型"]:
        if r["轮"].startswith("第") and r["模型ID"] != ["qdev::claude-opus-5.5"]:
            probs.append(f"{r['轮']} 的模型是 {r['模型ID']}")
    if sess.get("effortLevel") != "high":
        probs.append(f"档位是 {sess.get('effortLevel')}")
    tool_blob = json.dumps([pl(m) for m in msgs[:cut] if pl(m).get("type") in ("tool_call", "tool_result")], ensure_ascii=False)
    for w in FORBIDDEN + ["_MCP_"]:
        if w in tool_blob:
            probs.append(f"答题过程的工具调用里出现「{w}」")
    left = [p.name for n in chain for p in (root / f"第{n:02d}题_附件").glob("*_MCP_*")]
    if left:
        probs.append(f"附件里有 MCP 留底文件：{left}")
    for n in chain:
        calls = mcp_calls(seg.get(n, []))
        got = sorted({c["ticker"] for c in calls if c["ok"]})
        print(f"第{n:02d}题 MCP 成功调用：{got}；附件里留底的代码：{expected_tickers(n)}")
        if not calls:
            probs.append(f"第{n:02d}题没有 MCP 调用")
    assert not probs, probs
    out = RUN / "交付"
    for n in chain:
        d = out / t.folder(n).name
        if d.exists():
            shutil.rmtree(d)
        (d / "模型运行Trace").mkdir(parents=True)
        (d / "模型回复.md").write_text(reply_text(seg[n]) + "\n", encoding="utf-8")
        with zipfile.ZipFile(d / "模型产物.zip", "w", zipfile.ZIP_DEFLATED) as z:
            base = root / "产物" / f"第{n:02d}题"
            for f in sorted(base.rglob("*")):
                if f.is_file() and not f.name.startswith(".") and not is_trace(f):
                    z.write(f, f.relative_to(base))
        names = [f.name for f in traces]
        for f in traces:
            nm = f.name if names.count(f.name) == 1 else f"{f.parent.name}_{f.name}"
            shutil.copyfile(f, d / "模型运行Trace" / nm)
        json.dump(meta, open(d / "模型运行Trace" / "Kiro运行元数据摘录.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        (d / "模型运行截图").mkdir()
        for f in shots:
            name = f.name if f.parent.name == "截图" else f"完整对话_{f.name}"
            shutil.copyfile(f, d / "模型运行截图" / name)
        print(f"{d.name}: 回复 {len(reply_text(seg[n]))} 字，产物 {len(zipfile.ZipFile(d / '模型产物.zip').namelist())} 个，"
              f"trace {[x.name for x in (d / '模型运行Trace').iterdir()]}，截图 {len(shots)} 张")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["prepare", "check", "collect", "pack"])
    ap.add_argument("first", nargs="?", type=int)
    ap.add_argument("--附件说明", dest="note", action="store_true")
    o = ap.parse_args()
    {"prepare": lambda: prepare(o.note), "check": check, "collect": collect,
     "pack": lambda: pack(next(c for c in CHAINS if c[0] == o.first))}[o.cmd]()


if __name__ == "__main__":
    main()
