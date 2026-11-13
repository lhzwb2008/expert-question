"""把每道题的 README.md 转成带「复制」按钮的 复制页.html。

用法：python3 生成复制页.py
README.md 是唯一的内容来源，改完 README 重新跑一次即可。
"""

import html
from pathlib import Path

ROOT = Path(__file__).parent

PAGE = """<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body {{ font: 15px/1.7 -apple-system, "PingFang SC", sans-serif; max-width: 860px;
         margin: 32px auto; padding: 0 20px; color: #1f2328; }}
  h1 {{ font-size: 24px; }}
  h2 {{ font-size: 19px; margin-top: 40px; padding-bottom: 6px; border-bottom: 1px solid #d0d7de; }}
  h3 {{ font-size: 15px; margin: 24px 0 6px; }}
  .field {{ position: relative; background: #f6f8fa; border: 1px solid #d0d7de;
            border-radius: 6px; padding: 12px 84px 12px 14px; margin: 6px 0;
            white-space: pre-wrap; word-break: break-word; }}
  .field button {{ position: absolute; top: 8px; right: 8px; }}
  button {{ font: inherit; font-size: 13px; padding: 3px 12px; border: 1px solid #d0d7de;
            border-radius: 6px; background: #fff; cursor: pointer; }}
  button:hover {{ background: #eef1f4; }}
  button.done {{ background: #1a7f37; border-color: #1a7f37; color: #fff; }}
  table {{ border-collapse: collapse; margin: 8px 0; }}
  th, td {{ border: 1px solid #d0d7de; padding: 5px 12px; text-align: left; }}
  th {{ background: #f6f8fa; }}
</style>
</head>
<body>
{body}
<script>
function copyText(text) {{
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  return Promise.resolve();
}}
document.querySelectorAll('button[data-copy]').forEach(btn => {{
  btn.addEventListener('click', () => {{
    const text = btn.dataset.copy === 'self'
      ? btn.parentElement.querySelector('.text').textContent
      : btn.dataset.copy;
    copyText(text).then(() => {{
      btn.textContent = '已复制'; btn.classList.add('done');
      setTimeout(() => {{ btn.textContent = '复制'; btn.classList.remove('done'); }}, 1500);
    }});
  }});
}});
</script>
</body>
</html>
"""


def render(md: str) -> tuple[str, str]:
    out, title = [], ""
    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            j = i + 1
            while j < len(lines) and not lines[j].startswith("```"):
                j += 1
            text = html.escape("\n".join(lines[i + 1 : j]))
            out.append(
                f'<div class="field"><span class="text">{text}</span>'
                '<button data-copy="self">复制</button></div>'
            )
            i = j + 1
            continue
        if line.startswith("|"):
            j = i
            while j < len(lines) and lines[j].startswith("|"):
                j += 1
            rows = [[c.strip() for c in r.strip("|").split("|")] for r in lines[i:j]]
            head, body = rows[0], rows[2:]
            t = ["<table><tr>" + "".join(f"<th>{html.escape(c)}</th>" for c in head) + "<th></th></tr>"]
            for r in body:
                cells = "".join(f"<td>{html.escape(c)}</td>" for c in r)
                name = html.escape(r[0], quote=True)
                t.append(f'<tr>{cells}<td><button data-copy="{name}">复制</button></td></tr>')
            t.append("</table>")
            out.append("\n".join(t))
            i = j
            continue
        for level in (3, 2, 1):
            if line.startswith("#" * level + " "):
                text = line[level + 1 :]
                if level == 1:
                    title = text
                out.append(f"<h{level}>{html.escape(text)}</h{level}>")
                break
        else:
            if line.strip():
                out.append(f"<p>{html.escape(line)}</p>")
        i += 1
    return title, "\n".join(out)


def main() -> None:
    for readme in sorted(ROOT.glob("*/README.md")):
        title, body = render(readme.read_text(encoding="utf-8"))
        target = readme.with_name("复制页.html")
        target.write_text(PAGE.format(title=html.escape(title), body=body), encoding="utf-8")
        print(target.relative_to(ROOT))


if __name__ == "__main__":
    main()
