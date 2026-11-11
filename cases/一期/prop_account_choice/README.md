# 自营考试账户二选一

2026-11-05。第二道题。材料来自 ftmo-test 里 2026-10-24 那次真实测算：「Aqua Pay Later 200K 第一次可提现的概率高，还是 FTMO 100K 的 funded 概率高」。当时用的是 momentum 策略，这道题整套换成 Quantra 里做基准用的经典 Dual Thrust。

## 要决定的事

下个月只买一个考试账户。同一套 Dual Thrust 机器人、同样 2 倍杠杆，按 2024-01-03 至 2026-10-30 每个交易日滚动开考，看哪家更可能拿到第一笔可提现的钱。买错了，考试费和几个月的时间都押在成功率低的那家。

正式结果：Aqua 68.25%（445/652），FTMO 63.93%（397/621），买 Aqua。FTMO 拿到 Funded 的成功率是 90.02%，只作参考。完整数字见 `answer/标准结果.md`。

## 和第一题比，改了什么

- 场景从「模拟盘准入」换成「考试账户采购」，决策对象是两家平台，不是一套参数。
- 不放实习生的对照版本。题面直接、规则写死，难点在执行：1 分钟线、K 线内的处理顺序、两家各三个阶段的状态机、710 个开考日的滚动路径。
- 结论贴得近，几个常见错法会把结论翻过来（见 `answer/标准结果.md` 最后一张表），所以不能靠猜结论拿分。
- 交付物从「备忘录、台账、差异清单」换成「采购建议、逐开考日明细、按年汇总」。

## 没放进来的东西

momentum 策略（当日布林带 + VWAP、er5 门控、追踪止盈、冷清半仓等）的任何参数和代码都没进附件。`rebuild.py` 不 import Quantra 或 ftmo-test 的代码。

放进来的有：Dual Thrust（N=1、K1=K2=0.5、15 分钟检查、15:40 平仓，和 Quantra README 第 2 节的基准一致）、2 倍杠杆、两家的平台规则，以及机器人风控里的三个美元数：Aqua 单笔止损 1900、FTMO 单笔止损 4750、Aqua Funded 日盈上限 1100。1100 是当时在 momentum 上回测选出来的；介意的话换成 1200，重跑 `rebuild.py`，再把标答和考点的数一起换掉。

平台规则按 ftmo-test 里 `prob_aqua_vs_ftmo.py` 当时的口径写，去掉了 EA 的日亏缓冲和出金地板缓冲，并把每条比较的等号写死。这是本题口径，不一定和两家官网逐字一致；题面已经限定只用附件。

## 怎么核对

```bash
python3 cases/一期/prop_account_choice/rebuild.py             # 重算，写 answer/
python3 cases/一期/prop_account_choice/rebuild.py --export    # 先从 Quantra 重新导出 A01
```

去掉账户规则后，`rebuild.py` 的逐日权益和 `Quantra/backtest_dual_thrust.py` 完全一致（`selftest/cross_check_dt.py`，最大差 0）。

## 目录

- `attachments/A01_qqq_1min.csv`：QQQ 1 分钟线，2024-01-02 至 2026-10-30，276208 行，710 个可开考日。含 6 个半日市（12:59 收），2026-06-25 和 2026-08-25 各缺 15:30 一根。来源是 Quantra 的 `qqq_longport.csv`。
- `attachments/A02_背景与交易环境.md`：考试账户是什么，交易品种、成交、杠杆、判定方式等假设。
- `attachments/A03_DualThrust策略.md`：完整的 Dual Thrust 策略（思路、参数、Range 一般式、日内流程）、K 线内处理顺序、费用、机器人参数及其理由。
- `attachments/A04_Aqua_PayLater_200K.md`、`attachments/A05_FTMO_2Step_100K.md`：两家的阶段流程和平台规则。
- `attachments/A06_测算口径与交付.md`：开考方式、成功率口径、裁定、三份交付物。
- `answer/`：标答。`official_starts.csv` 是逐开考日明细，1420 行。
- `rebuild.py`：重算脚本。
- `填写稿.md`：飞书各字段起草稿。

## 还没做

豆包 2.1 Pro 正式自测还没跑。
