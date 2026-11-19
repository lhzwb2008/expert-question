# finance 收题表：给 agent 的工作说明

这份是 `finance/` 的总说明，写给继续往「金融」收题表填题的 agent，Cursor 和 Kiro 都适用。用户用中文交流。题目材料在 `finance/题目/`，填写稿是每个文件夹里的 `③填写稿.md`。

2026-11-18 用 Cursor 内置浏览器把第 13 题填进了表单，文字、选项和附件都进了表单数据。这一页记的是那次跑通的填法。表单内部的写法（`setEditorValue`、`SetRecord`、`getFormValue`）和用哪个 IDE 无关；只有「怎么开浏览器、怎么点、怎么传文件」两边工具不同，Kiro 的做法见下面「在 Kiro 里填」。

## 用户的固定要求

- 全程用中文回复。
- 用户说「填」只填到可检查的草稿。说「提交」之前，不点表单底部的「提交」，也不把「出题状态」选成「确认提交」。
- 新题挂在「量化研究员」下面，点这一行上的加号建子记录。不要用工具栏那个加号，那是新建顶层记录。
- 一次先填一道，给用户看过再填下一道。

## 表在哪

收题表：`https://bytedance.larkoffice.com/base/ABZUbyldlapLbds74fecw3jxngh`

Cursor 用内置浏览器打开；Kiro 用 `chrome-devtools` MCP 打开（见「在 Kiro 里填」）。账号是飞书（张文铂）。不要另开账号。

进入视图「③岗位下出题｜点岗位旁＋」。表 id `tbl94OOLIrmWsjdI`，这个视图 id `vewgXaX1uy`。

岗位行是「量化研究员」，下面已经有 01 到 12。新题从最后一道下面接着排。13、14、15 是港股红利产品的三轮链，轮次分别是第一轮、第二轮、第三轮。

## 填之前

1. 读该题的 `③填写稿.md`。引用块里的文字原样进对应字段，不要改写。
2. 附件用该题 `题目附件/` 和 `标准答案附件/` 里的文件，文件名和填写稿一致。
3. `browser_lock` 之后再点页面。填完给用户看时 `browser_unlock`。
4. 内置浏览器视口大约 465×635。点表格里的加号要先在截图上找坐标，见下面「怎么点」。

## 操作流程

1. 打开上面的视图，滚到「量化研究员」那一行，点行内加号（悬停提示是「添加子记录」）。出来的是记录表单，标题先是「未命名记录」，顶部有「扫码填写」。
2. 核对父记录已经是「量化研究员」。不是的话关掉，不要提交，回到第 1 步。
3. 立刻把「记录类型」改成「题目」。这一列在表单里高度是 0，点不到，只能用下面的 `SetRecord`。不改的话默认是「项目」，题目名称会被当成新项目名。
4. 按填写稿写入题目名称、轮次、题面、附件说明、跨软件说明、考点、标准答案。
5. 用界面把轮次、软件、MCP 点选出来，让用户能看见标签。数据层先写过一遍不够，下拉框仍会显示「请选择选项」。
6. 先打开「题目附件」的「添加附件」，传 `题目附件/` 里的文件；再打开「标准答案附件」的「添加附件」，传 `标准答案附件/` 里的文件。两个字段共用同一个 `input#attachment-upload`，必须先点开对应字段，再往这个 input 里放文件。
7. 用 `getFormValue()` 核对：记录类型是题目、父记录是量化研究员、轮次和软件是要的选项、文字长度和附件名单正确、「出题状态」是空。
8. 滚到表单顶部，解锁浏览器，让用户看。用户说提交之后，才点「提交」。

## 怎么点

`browser_mouse_click_xy` 用的是截图像素，不是 CSS 像素。截图是视口的 2 倍（大约 930×1270）。工具返回里会同时给出 Screenshot position 和 Viewport position，比例大约是 0.619（viewport = 截图坐标 × 0.619）。

表格是 canvas，加号不在无障碍树里。在截图上找「量化研究员」右侧的加号，换算后点击。点中的是 canvas，并且弹出的表单父记录是量化研究员，才算点对。

点之前如果报需要新截图，先 `browser_take_screenshot`，不要沿用更早的图。

## 字段 id

题目相关的字段。类型 1 是文本，3 是单选，4 是多选，17 是附件。

| 字段 | id | 类型 |
| --- | --- | --- |
| 项目／岗位／题目 | `fld9mOmdb6` | 1 |
| 记录类型 | `fldwNjXahJ` | 3 |
| 题目轮次 | `fldIK9XYAB` | 3 |
| 题面 | `fldECbZfIK` | 1 |
| 题目附件 | `fldvOrY3Gu` | 17 |
| 题目附件说明 | `fldXbBKcOv` | 1 |
| 预期涉及软件 | `fldRmkUB9i` | 4 |
| 预期使用的在线MCP | `flddZjer76` | 4 |
| 跨软件说明 | `fldziEjRpn` | 1 |
| 考点 | `fldvWCWNbY` | 1 |
| 标准答案 | `fld0Xz26db` | 1 |
| 标准答案附件 | `fldMYWmjvo` | 17 |
| 出题状态 | `fldRHSntTF` | 3 |
| 父记录 | `fldfAvgnBU` | 关联 |

选项 id，2026-11-18 从页面状态读出：

- 记录类型：项目 `optEO7uwW0`，岗位 `optdQjgFmu`，题目 `optUqU52ks`。
- 题目轮次：单轮题 `optC1peHUw`，第一轮 `opt6tSM92w`，第二轮 `optpLuP5Fz`，第三轮 `optl06IQnK`。
- 软件：公司文档库 `optsc4cRrk`，专业金融数据服务 `optlAdJYBa`，Python `optPoVJX2h`，Microsoft Excel `opt04J6kXZ`，Microsoft Word `optomIVMdE`。
- MCP：其他金融在线 MCP（在跨软件说明中写明）`optIqgFF1R`。

字段改过之后以页面上 `fieldMap` 为准，不要死记。

## 文字怎么写进去

飞书文本框是 editor-kit。`setText`、粘贴、`browser_fill` 都只会改编辑器外观，`getFormValue()` 里仍然是空的。`onEndEdit(true)` 会跳过真正的保存。

每个文本字段按这个顺序：

1. `scrollIntoView` 到 `[data-field-id="<id>"]`，否则虚拟列表没挂上编辑器。
2. 在这个节点里找 `.zone-container`，沿 React fiber 找到带 `setEditorValue` 的 `stateNode`。
3. `await onStartEdit()`，然后 `setEditorValue(全文)`，然后 `await onEndEdit()`。不要传参数。
4. `getSegments()` 的文本和原文一致，再用 `getFormValue()[fieldId]` 看到同一段，才算写上。

换行用 `\n`。填写稿里每一段引用块之间空一行，写进表单时用两个换行。

`getFormValue` 挂在字段节点往上的 `memoizedProps` 上。文本值有时是 `[{type:"text",text:"..."}]`，有时包一层 `{value: [...]}`，两种都要认。

## 选项怎么选

记录类型点不到（高度为 0）。从文本编辑器的 `stateNode.props` 取 `executeAction`、`tableId`、`viewId`、`recordId`，调用：

```javascript
await executeAction(() => ({
  cmd: "SetRecord",
  tableId, viewId,
  recordId: recordId || "",
  data: { fldwNjXahJ: { type: 3, value: "optUqU52ks" } }
}))
```

返回 `{"result":0}` 才算成功。多选的 `type` 是 4，`value` 是选项 id 数组。

这一步只保证提交时数据在。界面仍显示「请选择选项」。给用户看的标签要再打开下拉，用「查找选项」搜名称，点中那一项。多选下拉不会自动关，搜下一个词之前先清空搜索框。点不到列表里靠下的项时，先搜再点，不要点无障碍树里高度为 0 的项。

点完用 `getFormValue()` 再看一次，避免界面点击把之前写好的数组覆盖成只剩刚点的几项。

## 附件怎么传

`DOM.setFileInputFiles` 被浏览器工具拒绝。用本地临时服务把文件喂给页面：

1. 在本机起一个只监听 `127.0.0.1` 的 HTTP 服务，响应加上 `Access-Control-Allow-Origin: *`，根目录指到该题文件夹。填完就关掉。
2. 用真实点击打开该字段的「添加附件」。只在页面里 `click()` 往往不会挂上文件框。
3. 页面里 `fetch` 这些文件，放进 `DataTransfer`，赋给 `input#attachment-upload` 的 `files`，再派发 `change`。上传完成后这个 input 会被清空，这是正常的。
4. 题目附件和标准答案附件分开传。传完看 `getFormValue()` 里的文件名和大小。
5. 重复文件用同一种 `SetRecord` 收掉，附件字段 `type` 是 17，`value` 是保留下来的附件对象数组。这个值有时直接就是数组，有时是 `{value: 数组}`。

## 在 Kiro 里填

Kiro IDE 没有内置浏览器，用 Chrome DevTools MCP 驱动本机 Chrome。2026-11-19 装好并验证过。

### 装了什么

- Node.js v22 LTS，解压在 `~/.local/opt/node`（软链到具体版本目录），没有改系统 PATH。
- `chrome-devtools-mcp` 1.13.0，用这个 Node 的 `npm install -g` 装在 `~/.local/opt/node/lib/node_modules/`。
- 配置在仓库根目录 `.kiro/settings/mcp.json`，服务名 `chrome-devtools`，用绝对路径启动 node，带 `--experimentalVision`（开 `click_at` 坐标点击）和 `--viewport 1440x900`。同一个文件里也配了 `us-stocks`，和 `.cursor/mcp.json` 是同一个服务。
- 改了 `mcp.json` 保存即生效，不用重启 Kiro。连不上看 Kiro 面板的 MCP 页，或 Output →「Kiro - MCP Logs」。

重装：

```bash
export PATH=~/.local/opt/node/bin:$PATH
npm install -g chrome-devtools-mcp@latest
```

### 登录

MCP 启动的 Chrome 用的是独立的用户目录 `~/.cache/chrome-devtools-mcp/chrome-profile`，不是日常 Chrome 的登录态。第一次打开收题表会跳飞书登录页，让用户在弹出的 Chrome 窗口里扫码登录张文铂的账号，agent 不碰账号密码。登录一次以后这个目录会记住。

### 工具对照

Kiro 里这些工具是延迟加载的，先 `load_resource` 加载 `tool::chrome-devtools::<名字>`，再用 `tool_call` 调。

| Cursor 内置浏览器 | Kiro（chrome-devtools MCP） | 说明 |
| --- | --- | --- |
| 打开页面 | `new_page` / `navigate_page` | |
| `browser_take_screenshot` | `take_screenshot` | 截图是 CSS 像素，不用乘 0.619 |
| 无障碍树 | `take_snapshot` | 返回的 uid 给 `click`、`fill` 用 |
| `browser_mouse_click_xy` | `click_at` | 点 canvas 上「量化研究员」行的加号，坐标直接用截图上的 |
| 页面里跑脚本 | `evaluate_script` | `setEditorValue`、`SetRecord`、`getFormValue` 都在这里跑，函数可以是 async |
| `browser_lock` / `unlock` | 无 | 填的时候告诉用户先别动那个 Chrome 窗口 |
| 本地 HTTP 服务喂文件 | `upload_file` | 先真实点开字段的「添加附件」，再对 `input#attachment-upload` 的 uid 传本地绝对路径；不行再退回本地 HTTP 服务的办法 |

其余步骤（父记录核对、记录类型用 `SetRecord` 改成题目、文字写法、选项点选、核对清单）和上面完全一样。

### 2026-11-19 填第 22 题时实际跑通的细节

- 这一版页面是 React 16，fiber 挂在 `__reactInternalInstance$...` 上，不是 `__reactFiber`，两种都要认。`getFormValue` 在 `[data-field-id="fld9mOmdb6"]` 往上一层的 `memoizedProps` 上。
- 「量化研究员」行的加号在视口 1440×633 时大约是 (532, 237)，点了弹出右侧表单，父记录自动是量化研究员（`reczz28YNimATcwQ`）。
- `evaluate_script` 的 `sourcePath` 和 `take_snapshot` 的 `filePath` 只能读写 MCP 的工作区根目录，指到仓库或 `/tmp` 都被拒。要传大段文字或文件，起一个只监听 `127.0.0.1` 的 CORS 静态服务（根目录 `finance/`），页面里 `fetch`。表单文字放在 `_工具/表单文字/<题号>.json`，字段名 title、round、body、attach_note、cross、points、answer。
- 附件：先真实点开字段的「添加附件」，弹出「添加本地文件」浮层以后，`fetch` 文件放进 `DataTransfer`，赋给 `input#attachment-upload` 再派发 `change`，几秒后 `getFormValue` 里就有文件名和大小。没用到 `upload_file`。
- 下拉的「查找选项」框里 `Meta+A` 选不中文字，`type_text` 会接着往后打。清空要用原生 setter 改 `input.b-select-search` 的 value 再派发 `input` 事件。
- 多选界面点一项，数据层就只剩界面上点过的几项（先前 `SetRecord` 写的数组被覆盖）。五个软件全部点一遍以后数组才是全的，最后一定再看一次 `getFormValue`。
- 选完以后选项浮层不会自己关，点表单左侧空白处（如 (880, 520)）关掉。`Escape` 关不掉。
- 表单没点「提交」之前数据只在这个弹窗里。关掉弹窗、刷新页面都会丢，给用户看的时候不要动它。

## 不要做的事

- 不点「提交」，不选「确认提交」「返修中」「终止出题」，除非用户明确说提交。
- 不改项目背景、岗位描述、冗余文件。那些在「①建项目」「②写岗位描述」。
- 多轮题的后一轮，不带上一轮定稿成果就上传。验收会把每道题单独拿出来跑，题面点名的文件必须在本题题目附件里，并在附件说明里写明是上一步定稿的成果、本题用哪几个工作表。上一轮的标答原样复制过来，不改名。
- 填完不核对就告诉用户已经好了。至少核对记录类型、父记录、轮次、附件名单和出题状态。
