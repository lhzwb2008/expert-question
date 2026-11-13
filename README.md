# expert-question

五个项目各占一个文件夹。

- [high-econ](high-econ/README.md)：高经济价值出题（高经济 Q4）的底稿，一期、二期各六道题。
- [finance](finance/README.md)：「金融」专家评测出题的提交材料，十二道题，底稿取自 `high-econ/`。
- [office-expert](office-expert/)：办公专家。`C2V/` 是 Code2Video 标注插件，Chrome 从这里加载；`video-review/` 是「专业视频」内容评估的评述和试标文件。
- [magnet](magnet/AGENTS.md)：Magnet 评测出题，题目由 `high-econ/`、`finance/` 的旧案例一对一转换。总说明和浏览器代填工作流在 `magnet/AGENTS.md`。
- [gdpval](gdpval/AGENTS.md)：GDPval 九领域试标。规则和已跑通的填表步骤在 `gdpval/AGENTS.md`。恒指调整这一条的题干和参考文件在 `gdpval/试标_恒指调整/`，工作台草稿已写入，尚未提交。

`high-econ/` 和 `finance/` 里现有的题目、行情和规则都已经脱敏，数据可以直接使用。

`office-expert/video-review/trial-*/` 里有完整作业表导出和模型视频，只留在本机，不入库。
