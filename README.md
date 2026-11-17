# expert-question

六个项目各占一个文件夹。

- [high-econ](high-econ/README.md)：高经济价值出题（高经济 Q4）的底稿，一期、二期各六道题。
- [finance](finance/README.md)：「金融」专家评测出题的提交材料，十二道题，底稿取自 `high-econ/`。
- [office-expert](office-expert/)：办公专家。`C2V/` 是看视频、写人评的标注插件；`review-compare/` 是「作业标注对比」1.3.0，用来核对两份人评并导出可写回的 CSV；`video-review/` 是评述和试标文件。
- [magnet](magnet/)：Magnet 评测出题，规则、两道闸和代填方法见 [magnet/AGENTS.md](magnet/AGENTS.md)。QQQ 模拟盘准入已一阶段通过；2026-11-17 领题（UUID `3d02e777-1ea2-4ac9-9c77-8eeba1110267`）先交了报价权限，被判「题目过于简单」退回，同一 UUID 改交恒指调整（底稿 `high-econ/一期/ah_hsi_gate`），题目机审已过，评估候选产物生成中。同日另领两题：UUID `dca3291e-0da3-4ee6-a064-501593b6a5d5` 交了沪金午休（底稿 `high-econ/一期/au_lunch_gate`），Query 已交，题目机审中；UUID `f63c5544-0140-44c3-9218-a1142253ca9b` 交了商品跨期（底稿 `high-econ/一期/carry_screen`，行情换成三家交易所的全量日线），附件机审中。报价权限和赎回划付是同一种写法，按出题规范 v4.5 不可用，目录都已删除。
- [gdpval](gdpval/AGENTS.md)：GDPval 九领域试标。规则和已跑通的填表步骤在 `gdpval/AGENTS.md`。恒指调整这一条的题干和参考文件在 `gdpval/试标_恒指调整/`，工作台草稿已写入，尚未提交。
- [ALE](ALE/README.md)：Harbor 任务出题。首题采用 ETF 低波动配权归因离线版，输入、参考成果和评分已提交试标；环境、Oracle／nop、模型难度和许可验收仍待完成。

`high-econ/` 和 `finance/` 里现有的题目、行情和规则都已经脱敏，数据可以直接使用。

`office-expert/video-review/trial-*/` 里有完整作业表导出和模型视频，只留在本机，不入库。
