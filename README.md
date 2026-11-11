# 出题底稿

飞书高经济价值出题的本地底稿。一期的六道题在 `cases/一期/`，二期从 `cases/二期/` 起。

按收题表整理好的提交材料在 [项目提交](项目提交/README.md)。十二道题在 `项目提交/题目/`，文件夹按生成顺序编号，从 `01_恒指调整AH交易` 到 `12_港股持仓流动性限额`。

出题口径以一期第一题为准：[cases/一期/qqq_turtle_gate](cases/一期/qqq_turtle_gate/README.md)。2026-11-06 确认：满分 100 分，豆包 2.1 Pro 得分不超过 50；考点拆成 3 到 6 个维度，加总 100，每维 3 到 4 个可核对的等级，并写明易错点。标答文字要写裁定理由。细节在参考案例的「平台要求」「考点怎么写」「注意事项」。

## 一期

1. [cases/一期/qqq_turtle_gate](cases/一期/qqq_turtle_gate/README.md)，QQQ 日线模拟盘准入。
2. [cases/一期/prop_account_choice](cases/一期/prop_account_choice/README.md)，自营考试账户二选一。
3. [cases/一期/au_lunch_gate](cases/一期/au_lunch_gate/README.md)，沪金午休跟随是否上实盘。
4. [cases/一期/fx_news_window](cases/一期/fx_news_window/README.md)，GBP/USD 新闻过滤方案选择。
5. [cases/一期/carry_screen](cases/一期/carry_screen/README.md)，商品跨期价差品种准入。
6. [cases/一期/ah_hsi_gate](cases/一期/ah_hsi_gate/README.md)，恒生成份股调整交易是否开展。

## 二期

1. [cases/二期/funding_book](cases/二期/funding_book/README.md)，永续资金费账本选择。
2. [cases/二期/pairs_desk](cases/二期/pairs_desk/README.md)，美股配对交易候选对筛选。
3. [cases/二期/var_model](cases/二期/var_model/README.md)，多资产组合 VaR 模型回测选型。
4. [cases/二期/factor_library](cases/二期/factor_library/README.md)，A 股量价因子入库检验。
5. [cases/二期/exec_algo](cases/二期/exec_algo/README.md)，招商银行大单拆单算法选型。
6. [cases/二期/etf_weights](cases/二期/etf_weights/README.md)，ETF 组合月度配权方案选型。

二期每道题的目录约定：`attachments/` 里全部是输入附件，`answer/` 里全部是标准答案附件，两个文件夹都可以整夹上传。`填写稿.md`、`标准结果.md`、`rebuild.py`、`raw/` 放在题目根目录，不上传。

下一题从这里开始：

1. 读参考案例里的「平台要求」「考点怎么写」「注意事项」和「下一题按这个顺序」。
2. 在 `cases/二期/<题目目录>/` 按上面的约定放文件。说明里写清决策、材料从哪来、正式结果。
3. 标答用本地程序跑死，再写考点。题面里不放考点，也不放结果。
4. 用豆包 2.1 Pro 做正式自测。其他模型只能用来检查材料和题干。

`.env` 和 `cases/**/selftest/` 不入库。RSI 采集表的 PDF 留在本机，不属于这道案例。
