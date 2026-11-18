# finance 收题表：给 agent 的工作说明

这份是 `finance/` 的总说明，写给在 Cursor 里继续往「金融」收题表填题的 agent。用户用中文交流。题目材料在 `finance/题目/`，填写稿是每个文件夹里的 `③填写稿.md`。

2026-11-18 用 Cursor 内置浏览器把第 13 题填进了表单，文字、选项和附件都进了表单数据。这一页记的是那次跑通的填法。

## 用户的固定要求

- 全程用中文回复。
- 用户说「填」只填到可检查的草稿。说「提交」之前，不点表单底部的「提交」，也不把「出题状态」选成「确认提交」。
- 新题挂在「量化研究员」下面，点这一行上的加号建子记录。不要用工具栏那个加号，那是新建顶层记录。
- 一次先填一道，给用户看过再填下一道。

## 表在哪

收题表：`https://bytedance.larkoffice.com/base/ABZUbyldlapLbds74fecw3jxngh`

用 Cursor 内置浏览器打开，账号是已经登录的飞书（张文铂）。不要另开账号。

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

## 不要做的事

- 不点「提交」，不选「确认提交」「返修中」「终止出题」，除非用户明确说提交。
- 不改项目背景、岗位描述、冗余文件。那些在「①建项目」「②写岗位描述」。
- 不把上一轮的标准答案放进下一轮的题目附件。后一轮用到的前序成果由项目组从前一轮标答提供。
- 填完不核对就告诉用户已经好了。至少核对记录类型、父记录、轮次、附件名单和出题状态。
