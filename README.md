# expert-question

六个项目各占一个文件夹。

- [high-econ](high-econ/README.md)：高经济价值出题（高经济 Q4）的底稿，一期、二期各六道题。
- [finance](finance/README.md)：「金融」专家评测出题的提交材料，十二道题，底稿取自 `high-econ/`。
- [office-expert](office-expert/)：办公专家。`C2V/` 是看视频、写人评的标注插件；`review-compare/` 是「作业标注对比」1.3.0，用来核对两份人评并导出可写回的 CSV；`video-review/` 是评述和试标文件。
- [magnet](magnet/)：Magnet 评测出题，规则、失败复盘和代填方法见 [magnet/AGENTS.md](magnet/AGENTS.md)。QQQ 模拟盘准入已一阶段通过。恒指调整、沪金午休、商品跨期、可转债条款和 ETF 期权均已确认不能满足真实模型评估门槛，不再返修旧题；失败题本地材料已清理，其他项目底稿保留。最后一次新题 [港股连续赎回](magnet/09_量化投研与交易_港股连续赎回/README.md) 已从 `finance/题目/12_港股持仓变现能力` 转换，九附件包、Query和基础核对完成；平台窗口额度为0，尚未领取或提交。
- [gdpval](gdpval/AGENTS.md)：GDPval 九领域试标。规则和已跑通的填表步骤在 `gdpval/AGENTS.md`。恒指调整这一条的题干和参考文件在 `gdpval/试标_恒指调整/`，工作台草稿已写入，尚未提交。
- [ALE](ALE/README.md)：Harbor 任务出题。首题采用 ETF 低波动配权归因离线版，输入、参考成果和评分已提交试标；环境、Oracle／nop、模型难度和许可验收仍待完成。

`high-econ/` 和 `finance/` 里现有的题目、行情和规则都已经脱敏，数据可以直接使用。

`office-expert/video-review/trial-*/` 里有完整作业表导出和模型视频，只留在本机，不入库。
