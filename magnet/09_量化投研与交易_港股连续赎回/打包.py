#!/usr/bin/env python3
"""生成港股连续赎回研究附件并做一次基础核对；内部计算不进入附件包。"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import shutil
import urllib.request
import zipfile
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal as D, ROUND_FLOOR, ROUND_HALF_UP, ROUND_CEILING
from pathlib import Path

import fitz
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SOURCE = ROOT / 'finance/题目/12_港股持仓变现能力'
RAW = ROOT / 'finance/_工具/新题数据/港股流动性'
ATT = HERE / '附件'
PREFIX = '港股回款_'
START, LAST_TRADE, END = '2026-10-02', '2026-11-06', '2026-11-10'
REQUESTS = ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23']
RATES = [D('.10'), D('.20'), D('.30'), D('.50')]
SCALES = [D(x) / 100 for x in range(5, 151, 5)]
HOLIDAYS = {'2026-05-25', '2026-06-19', '2026-07-01', '2026-10-01', '2026-10-19'}
UNITS = {'0700.HK': 100, '9988.HK': 100, '0941.HK': 500, '1299.HK': 200,
         '2318.HK': 500, '0883.HK': 1000, '0388.HK': 100, '6990.HK': 500,
         '1952.HK': 500, '9969.HK': 1000, '9626.HK': 20, '3896.HK': 2000}
FEE_NAMES = ['佣金', '印花税', '证监会征费', '财汇局征费', '交易费', '结算费']
PUBLIC = {
    'A05_港交所2026年休市通告.pdf': 'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf',
    'A06_结算费调整生效通告.pdf': 'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/HKSCC/2025/ce_HKSCC_SET_022_2025.pdf',
}
SETTLE_URL = 'https://www.hkex.com.hk/Services/Settlement-and-Depository/Settlement?sc_lang=en'
T1_URL = 'https://www.hkex.com.hk/News/Market-Communications/2026/261016news?sc_lang=en'
FEE_URL = 'https://www.hkex.com.hk/Services/Rules-and-Forms-and-Fees/Fees/Securities-(Hong-Kong)/Trading/Transaction?sc_lang=en'


def money(x):
    return D(x).quantize(D('.01'), rounding=ROUND_HALF_UP)


def floor(x):
    return int(D(x).to_integral_value(rounding=ROUND_FLOOR))


def ceil(x):
    return int(D(x).to_integral_value(rounding=ROUND_CEILING))


def calendar():
    d, result = date(2026, 5, 4), []
    while d <= date(2026, 11, 11):
        if d.weekday() < 5 and d.isoformat() not in HOLIDAYS:
            result.append(d.isoformat())
        d += timedelta(days=1)
    return result


CAL = calendar()


def workbook(path, sheets):
    w = Workbook()
    w.remove(w.active)
    for name, headers, rows in sheets:
        s = w.create_sheet(name)
        s.append(headers)
        for row in rows:
            s.append([float(x) if isinstance(x, D) else x for x in row])
        s.freeze_panes = 'A2'
        s.auto_filter.ref = s.dimensions
        for c in s[1]:
            c.font = Font(bold=True, color='FFFFFF')
            c.fill = PatternFill('solid', fgColor='234B67')
            c.alignment = Alignment(wrap_text=True, vertical='center')
        for j, h in enumerate(headers, 1):
            s.column_dimensions[get_column_letter(j)].width = min(48, max(16, len(h) * 2 + 3))
        s.row_dimensions[1].height = 34
    w.save(path)


def pdf(path, title, sections):
    doc = fitz.open()
    for heading, paras in sections:
        lines = [title, '', heading, '']
        for p in paras:
            # 中文等宽字体下按字符宽度换行，网址单独放在来源工作表中。
            line, width = '', 0
            for c in p:
                step = 1 if ord(c) < 128 else 2
                if width + step > 86:
                    lines.append(line)
                    line, width = '', 0
                line += c
                width += step
            if line:
                lines.append(line)
            lines.append('')
        for off in range(0, len(lines), 42):
            page = doc.new_page(width=595, height=842)
            page.insert_text((42, 48), '\n'.join(lines[off:off + 42]), fontname='china-s', fontsize=10, lineheight=1.65)
            page.insert_text((42, 810), f'{len(doc)}', fontsize=9)
    doc.save(path)
    doc.close()


def load_sources():
    holds = list(csv.DictReader((SOURCE / '题目附件/港股流动性_A02_持仓清单.csv').open(encoding='utf-8')))
    market, provenance, original = {}, [], {}
    for h in holds:
        code = h['code']
        data = (RAW / f'{code}.json').read_bytes()
        rec = json.loads(data)
        rawrows = json.loads(rec['原始返回']['content'][0]['text'], parse_float=D)
        rows = {}
        for rawrow in rawrows:
            day = (datetime.fromisoformat(rawrow['Date'].replace('Z', '+00:00')) + timedelta(hours=8)).date().isoformat()
            if '2026-05-04' <= day <= '2026-11-11':
                assert day not in rows
                rows[day] = dict(rawrow, day=day, close=money(rawrow['Close']), volume=int(rawrow['Volume']))
        needed = [d for d in CAL if d <= LAST_TRADE]
        assert all(d in rows for d in needed), (code, '行情缺日')
        assert not any(d not in CAL for d in rows), (code, '行情存在非交易日')
        assert all(r['Stock Splits'] == 0 for r in rawrows), (code, '拆分需另核')
        assert all(r['Dividends'] == 0 for d, r in rows.items() if d >= '2026-09-30'), (code, '执行窗口后存在除息，不能直接使用复权价格')
        market[code] = rows
        original[code] = rec
        provenance.append([code, rec['查询时间'], rec['MCP服务地址'], rec['工具'], json.dumps(rec['参数'], ensure_ascii=False), hashlib.sha256(data).hexdigest()])
        h['shares'] = int(h['shares'])
        h['unit'] = UNITS[code]
    return holds, market, provenance, original


SECTIONS = [
    ('一、研究用途与数据边界', [
        '研究对象为既有十二只港股组合的连续按比例减持和现金回收能力。持仓数量沿用既有研究，不代表任何实盘账户；重复赎回、执行单位、通道容量、佣金及划款约束均为本次研究假设，不是券商回单或已签署产品条款。',
        '行情来自已有的US Stocks MCP实际查询快照，数据提供方为Yahoo Finance。十一只股票的原始字段在A01；1952.HK保留为A02原始JSON，需与A01对齐。价格只使用Close，先四舍五入至港元分；Volume单位为股。日期字段为UTC，交易日为香港当地日期。',
        '静态基准日为2026-10-30；动态研究的初始证券数量视为2026-09-30收盘后持有，2026-10-02开始成交，2026-11-06收盘停止新增成交，继续处理既有交收到2026-11-10。初始现金、融资、证券借贷、额外申购及原持仓以外资产均为零。',
        'ADV只涉及成交量，不对历史成交量因现金股息再做调整。执行窗口及之后至查询日应核验分红和拆分字段；遇到价格无法确认为可用口径时列待核，不补造价格。快照查询时间晚于回放日期不代表能在回放时使用未来行情。',
        'A08是原项目已有静态测算成品的原样副本，并非本次连续回款研究的结论，也非第三方实盘结果。原静态口径不考虑冲击、费用、批次重叠和交收，仅用于复核对照。']),
    ('二、静态基线与重复申请', [
        '静态基线按A03原始数量和2026-10-30收盘价计值。每股ADV20、ADV60包含基准日、按其有行情的最近20和60个交易日取算术平均（零成交量行也保留）；日可变现股数为较小ADV的25%向下取整至一股，不按执行单位取整。每股全部变现天数向上取整。',
        '静态变现阶梯为1、2、3、5、10交易日，以各股min(初始数量，期限乘日可变现数量)计值后除组合总市值。四档一次性赎回分别为10%、20%、30%、50%，每股目标股数向上取整至一股，情景天数取最慢股票，瓶颈保留所有并列。仅原静态口径按30%情景不超过3日为每日、4至5日为每周、至少6日为每月。',
        '动态四档分别独立从全部初始持仓启动，档与档不共享容量或资产。每档均在2026-10-02、10-09、10-16、10-23开市前接受一次同档比例申请，顺序记为首期、次期、三期、四期。日期均按香港交易日理解。',
        '每次申请每股以尚未划给任何既有批次的自由证券为基数，乘本档比例并向上取整到一股，形成固定篮子目标。实际持仓中仍有未成交的既有批次预留量，不能再分配给新申请。预留持续至该部分成交；已分配目标无撤销、无回补、不因涨跌重定数量。',
        '每批的比较基准金额为该篮子各股目标数量乘申请前一个交易日的收盘价之和，不是固定赎回负债。划款为本批实际成交净回款，价格差和费用由本批承担。本研究不实现按基金份额净值支付、现金垫付或不同投资者之间的补贴。']),
    ('三、共享成交额度及执行路线', [
        '每股每个成交日的预估额度按当日之前最近20和60个有行情交易日ADV的较小值乘25%；历史成交量为零仍占窗口。本次可成交总量还受当日实际Volume的10%约束，两项取小后向下取整到一股。前者为盘前上限，后者为当日可实现容量，不作为盘前已知量。',
        '同一档情景内，不同申请批次共享该股票当天唯一额度。执行优先级为整批路线在先、尾单路线在后；各路线内部依申请先后。某股闲余额度不能转给其他股票，也不能滚存到次日。',
        'A09的执行单位是研究中的整批路由步长，不声称是交易所当期法定每手股数。每批每股目标在生成时固定拆成整批部分和小于一个执行单位的尾数。整批部分按执行单位整数倍交易，先满足早批次，余量再给后批次。不同批次尾数不拼成整批。',
        '尾单只在该批该股整批部分已于前一交易日或更早全部完成后才可交易；整批部分为零的，以申请日作为完成基准，尾单最早次一交易日成交。尾单须一次全部成交，并占用整批路线处理后余下的同股总额度，额度不足则顺延。',
        '整批路线按当日分位Close成交。尾单按当日分位Close乘98%后再四舍五入至分成交，不以原始浮点Close直接乘折扣。不另加滑点，成交价和估值价不混用。',
        '同档、同日、同股、同路线的各批分配合成一笔成交单。不能把整批与尾单合单；不能跨日期或股票合单。成交明细须同时保留汇总单和批次分配，不能仅列总成交量。']),
    ('四、费用与批次分摊', [
        '费率和佣金假设在A09。各费用按每张汇总成交单分别计算。成交金额是路线成交价乘总股数，佣金为金额乘佣金率与最低佣金中的较大值；印花税按金额乘费率向上取整至整港元，其余费用各自四舍五入至分，最后求和。',
        '结算费适用A06生效通告对应的普通股票规则；旧最低及最高收费不再沿用。本研究将该项成本全额穿透计入投资组合，此为研究假设，不代表任意券商向客户必然收取相同费用。A07中的T+1路线图须区分公告日期和实际实施日期。',
        '每项费用分别按该单各批次成交金额占比分配。先向下取整到分，剩余分按未取整余数从大到小分，每批每轮至多一分；余数相同先给较早批次。不得先把总费用合并分配，不得对每批重新应用最低佣金或印花税进位。批次净额为批次成交金额减分配到的各项费用。',
        '费用扣除时点与成交净额交收一致。个别很小尾单净额可为负数，按费用净支出记账，不虚构负股数，不将费用截为成交金额；其同批前期已交收余额可支付这笔费用。']),
    ('五、交收、现金与期限', [
        '按A05交易休市安排和A07交收制度确定交收日。本研究窗口内交易日与交收营业日相同，正常成交为T+2，成交日不计入这两个日数。不是自然日加二，也不因为已公布T+1路线图而提前切换。',
        '当日成交净额记应收交收款；交收日先将当日到期的净额计入批次现金，再于当日日终处理划付。不同批次的现金独立归属，全部目标股数成交且该批全部汇总单分配净额已到期交收，才一次性划出该批累计净回款。不得因为总账户有其他批次现金而提前支付。',
        '批次完成交易日和全额可划款日分别保留。周度受理条件为该批从申请日开始（申请日记第1个交易日）至全额可划款日不超过7个交易日，四批均须达标。未成交、未交收或未完成的批次均不达标；注明截至日和剩余资产，不把截至日伪装为完成日。',
        '每日证券按初始数量减累计成交核对，预留量按各批尚未成交目标之和核对，自由量为实际持仓减预留量。账户现金按累计已交收净额减累计划款核对，应收交收款按全部成交净额减已交收净额核对。累计成交净额还须等于累计成交总额减累计六项费用。',
        '应收款属于已成交未回款，未成交篮子属于证券；两者既不相互替代，也不得重复计入回款。分批划款后仍要保留账户其余自由证券。研究期末未卖完的股票按最后成交研究日Close列示市值，不当成已回款。']),
    ('六、容量反推与结论边界', [
        '在A09规模网格逐点评估：每股初始数量为A03数量乘规模倍数后向下取整到一股，其他参数不变。每一倍数下四档连续申请独立回放，保留每档四批共16个批次结果。不能用一个基准日ADV比例缩放来替代回放。',
        '容量建议依据30%一档四批全部满足7交易日回款条件的最大网格倍数。存在多个可行点取最大倍数；无可行点则写网格内无支持规模。逐点检查，不假定整批、尾单和最低费用下所有指标连续或单调。',
        '建议最大倍数对应的完整成交和现金链，以及紧邻其上的一个网格点均须保留；无可行点时保留最小网格点，若最大网格点可行则说明上界未被网格识别。原规模1.00的四档完整链一并交付，不重复复制已经相同的结果。',
        '将新研究和A08逐项对账，区别数据核对错误、方法口径不同和任务范围新增。原静态结论不自动等于连续回款结论。给出原规模是否支持周度安排、可支持规模及最慢批次；另列实际净回款相对申请前估值的价格变动与费用影响。',
        '研究仅覆盖附件价格、既定申请节奏和执行假设；不能据此保证未来流动性、基金实际赎回定价、交易冲击模型或其他开放频率。所有待核数据须说明对建议的影响。']),
]


def generate(holds, market, provenance, original):
    ATT.mkdir(parents=True, exist_ok=True)
    sheets = []
    for code in [h['code'] for h in holds if h['code'] != '1952.HK']:
        rows = [[r['Date'], r['Close'], r['Volume'], r['Dividends'], r['Stock Splits']]
                for d, r in sorted(market[code].items())]
        sheets.append((code, ['Date_UTC', 'Close_原始返回', 'Volume_股', 'Dividends', 'Stock Splits'], rows))
    sources = [['行情原始返回', *p] for p in provenance]
    for name, url in PUBLIC.items():
        sources.append([name, '', '2026-11-18检索', url, '', '', ''])
    for title, url in [('交收制度网页', SETTLE_URL), ('T+1路线图网页', T1_URL), ('交易收费网页', FEE_URL)]:
        sources.append([title, '', '2026-11-18检索', url, '', '', ''])
    sheets.append(('来源与留痕', ['材料', '股票代码', '原查询时间或检索日', '来源URL', '工具', '参数', '原文件SHA256'], sources))
    workbook(ATT / (PREFIX + 'A01_十一股行情与来源.xlsx'), sheets)
    shutil.copyfile(RAW / '1952.HK.json', ATT / (PREFIX + 'A02_1952原始查询.json'))
    shutil.copyfile(SOURCE / '题目附件/港股流动性_A02_持仓清单.csv', ATT / (PREFIX + 'A03_研究组合持仓.csv'))
    pdf(ATT / (PREFIX + 'A04_连续回款研究口径.pdf'), '港股组合连续回款研究口径', SECTIONS)
    for name, url in PUBLIC.items():
        p = ATT / (PREFIX + name)
        if not p.exists():
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as response:
                data = response.read()
            assert data.startswith(b'%PDF'), name
            p.write_bytes(data)
        doc = fitz.open(p)
        text = ''.join(page.get_text() for page in doc)
        if 'A05' in name:
            assert '2026' in text and '19' in text and 'October' in text
        else:
            assert '0.0042%' in text and '2025' in text and 'June' in text
        doc.close()
    pdf(ATT / (PREFIX + 'A07_交收制度与路线图摘录.pdf'), '公开交收资料摘录（非官方重发文件）', [
        ('交收制度页面原文节选', [
            '来源：香港交易所 Settlement - Securities。网页原文：',
            'Stock and money positions of all Exchange Trades and Clearing Agency Transactions are required to be settled on T+2 day whereas stock positions of China Connect Securities Trades are settled on T day.',
            '原文只说明制度，不说明特定券商的客户可提取资金时间。本研究的日终可划付约定另见研究口径。完整来源地址列在A01来源与留痕。']),
        ('2026年10月16日路线图原文节选', [
            '来源：香港交易所 HKEX Sets Roadmap for T+1 Transition in Securities Market，2026-10-16。网页原文：',
            'Taking into account stakeholder feedback, HKEX now targets T+1 implementation in the second half of 2028, subject to market readiness and regulatory approval.',
            '此页为公开网页摘录；摘录没有将目标实施日改写为已经实施。完整来源地址列在A01来源与留痕。']),
    ])
    shutil.copyfile(SOURCE / '标准答案附件/港股持仓变现能力测算表.xlsx', ATT / (PREFIX + 'A08_既有静态测算.xlsx'))
    workbook(ATT / (PREFIX + 'A09_研究参数.xlsx'), [
        ('执行单位', ['代码', '名称', '整批执行单位_股', '性质'], [[h['code'], h['name'], h['unit'], '研究路由参数，非实盘回单或法定每手声明'] for h in holds]),
        ('费用', ['项目', '费率_小数', '最低金额_港元', '取整', '依据或性质'], [
            ['佣金', D('.0003'), 18, '逐单四舍五入至分', '研究假设'],
            ['印花税', D('.001'), None, '逐单向上进位至整港元', '港交所交易收费网页；非豁免普通股票'],
            ['证监会征费', D('.000027'), None, '逐单四舍五入至分', '港交所交易收费网页'],
            ['财汇局征费', D('.0000015'), None, '逐单四舍五入至分', '港交所交易收费网页'],
            ['交易费', D('.0000565'), None, '逐单四舍五入至分', '港交所交易收费网页'],
            ['结算费', D('.000042'), None, '逐单四舍五入至分', 'A06普通股票；研究假设全额计入组合'],
        ]),
        ('规模网格', ['规模倍数'], [[x] for x in SCALES]),
        ('申请节奏', ['批次', '申请交易日', '四个独立情景比例'], [[f'第{i + 1}批', d, '10% / 20% / 30% / 50%'] for i, d in enumerate(REQUESTS)]),
        ('参数', ['名称', '值', '单位或性质'], [
            ['历史参与率', D('.25'), '研究假设'], ['当日可实现参与率', D('.10'), '研究假设'],
            ['尾单价格系数', D('.98'), '研究假设'], ['周度回款期限', 7, '交易日，申请日为第1日'],
            ['规模推荐依据', '30%档的全部四批', '其余档为压力参照'],
        ]),
    ])


def fees(gross, mode='normal'):
    settle = money(gross * D('.000042'))
    if mode == '旧结算费':
        settle = money(min(D(100), max(D(2), gross * D('.00002'))))
    return [money(max(D(18), gross * D('.0003'))), D(ceil(gross * D('.001'))),
            money(gross * D('.000027')), money(gross * D('.0000015')),
            money(gross * D('.0000565')), settle]


def allocate_fee(fee, weights):
    total = sum(weights)
    raw = [fee * w / total for w in weights]
    out = [x.quantize(D('.01'), rounding=ROUND_FLOOR) for x in raw]
    remaining = int((fee - sum(out)) * 100)
    order = sorted(range(len(raw)), key=lambda i: (-(raw[i] - out[i]), i))
    for i in order[:remaining]:
        out[i] += D('.01')
    assert sum(out) == fee
    return out


def static(holds, market):
    result = []
    for h in holds:
        code, q = h['code'], h['shares']
        days = [d for d in sorted(market[code]) if d <= '2026-10-30']
        a20 = sum(D(market[code][d]['volume']) for d in days[-20:]) / 20
        a60 = sum(D(market[code][d]['volume']) for d in days[-60:]) / 60
        cap = floor(min(a20, a60) / 4)
        result.append(dict(code=code, q=q, a20=a20, a60=a60, cap=cap,
                           value=q * market[code]['2026-10-30']['close'], days=math.ceil(q / cap)))
    total = sum(r['value'] for r in result)
    scenario = {str(p): max(math.ceil(ceil(r['q'] * p) / r['cap']) for r in result) for p in RATES}
    assert total == D('2653690430.00')
    assert list(scenario.values()) == [2, 3, 4, 6]
    return {'total': total, 'scenario': scenario, 'rows': result}


def simulate(holds, market, rate, scale=D(1), mode='normal', trace=False):
    codes = [h['code'] for h in holds]
    initial = {h['code']: floor(h['shares'] * scale) for h in holds}
    actual, free = initial.copy(), initial.copy()
    batches, tickets, allocations, capacity, positions, cash_rows, targets = [], [], [], [], [], [], []
    by_code = {h['code']: h for h in holds}
    prev_days = {d: CAL[:CAL.index(d)] for d in CAL}
    dates = [d for d in CAL if START <= d <= END]
    for day in dates:
        if day in REQUESTS:
            p = len(batches)
            goal = {}
            for code in codes:
                basis = actual[code] if mode == '重复预留' else free[code]
                q = min(free[code], ceil(D(basis) * rate))
                goal[code] = q
                free[code] -= q
                targets.append([p + 1, day, code, basis, q, free[code]])
            base = sum(goal[c] * market[c][prev_days[day][-1]]['close'] for c in codes)
            batches.append(dict(day=day, goal=goal, sold={c: 0 for c in codes}, gross=D(0), fee=D(0),
                                net=D(0), cash=D(0), paid=D(0), pay_day=None, done_day=None, benchmark=base,
                                main_done={c: day if goal[c] < by_code[c]['unit'] else None for c in codes}))
        if day <= LAST_TRADE:
            for code in codes:
                h = by_code[code]
                eligible = prev_days[day] + ([day] if mode == 'ADV包含当日' else [])
                a20 = sum(D(market[code][d]['volume']) for d in eligible[-20:]) / 20
                a60 = sum(D(market[code][d]['volume']) for d in eligible[-60:]) / 60
                adv = a60 if mode == '只用ADV60' else min(a20, a60)
                forecast, realized = adv / 4, D(market[code][day]['volume']) / 10
                cap = floor(forecast if mode == '忽略当日容量' else min(forecast, realized))
                budget, consumed = cap, 0
                price = market[code][day]['close']
                for route in ['整批', '尾单']:
                    fills = []
                    for bi, b in enumerate(batches):
                        if mode == '各批独享容量':
                            budget = cap
                        target, sold = b['goal'][code], b['sold'][code]
                        unit = h['unit']
                        main = (target // unit) * unit
                        if route == '整批':
                            q = min(max(0, main - sold), budget // unit * unit)
                            if q:
                                b['sold'][code] += q
                                if b['sold'][code] >= main:
                                    b['main_done'][code] = day
                        else:
                            left = target - sold
                            done = b['main_done'][code]
                            allowed = done and (done <= day if mode == '尾单当日完成' else done < day)
                            q = left if allowed and 0 < left < unit and left <= budget else 0
                            if q:
                                b['sold'][code] += q
                        if q:
                            fills.append((bi, q))
                            budget -= q
                            consumed += q
                            actual[code] -= q
                    if not fills:
                        continue
                    px = money(price * D('.98')) if route == '尾单' and mode != '尾单不折价' else price
                    # 正式口径合并成单；单独计费只用于内部必要敏感性检查。
                    groups = [[fill] for fill in fills] if mode == '按批重复计费' else [fills]
                    for group in groups:
                        quantities = [q for _, q in group]
                        weights = [D(q) * px for q in quantities]
                        fee = fees(sum(weights), mode)
                        split = [allocate_fee(f, weights) for f in fee]
                        settle_day = CAL[CAL.index(day) + 2]
                        if mode == '成交即现金':
                            settle_day = day
                        elif mode == '自然日交收':
                            nominal = (date.fromisoformat(day) + timedelta(days=2)).isoformat()
                            settle_day = next(d for d in CAL if d >= nominal)
                        tid = len(tickets) + 1
                        tickets.append(dict(id=tid, day=day, code=code, route=route, q=sum(quantities),
                                            price=px, gross=sum(weights), fees=fee, settle=settle_day,
                                            net=sum(weights) - sum(fee)))
                        for j, (bi, q) in enumerate(group):
                            fs = [col[j] for col in split]
                            net = weights[j] - sum(fs)
                            allocations.append(dict(ticket=tid, batch=bi, day=day, code=code, route=route,
                                                    q=q, gross=weights[j], fees=fs, net=net, settle=settle_day))
                            b = batches[bi]
                            b['gross'] += weights[j]
                            b['fee'] += sum(fs)
                            b['net'] += net
                if trace:
                    capacity.append([day, code, eligible[-20], eligible[-1], a20, eligible[-60], a60,
                                     forecast, realized, cap, consumed, cap - consumed])
                assert actual[code] >= 0
                if mode != '各批独享容量':
                    assert consumed <= cap
        for bi, b in enumerate(batches):
            received = sum(a['net'] for a in allocations if a['batch'] == bi and a['settle'] == day)
            b['cash'] += received
            complete = all(b['sold'][c] == b['goal'][c] for c in codes)
            if complete and not b['done_day']:
                b['done_day'] = day
            pending = [a for a in allocations if a['batch'] == bi and a['settle'] > day]
            paid_today = D(0)
            if complete and not pending and not b['pay_day']:
                b['pay_day'] = day
                paid_today = b['cash']
                b['paid'] += paid_today
                b['cash'] = D(0)
                assert b['paid'] == b['net']
            if trace:
                cash_rows.append([day, bi + 1, received, sum(a['net'] for a in pending), paid_today, b['cash'],
                                  sum(b['goal'][c] - b['sold'][c] for c in codes), b['done_day'], b['pay_day']])
        for code in codes:
            reserved = sum(b['goal'][code] - b['sold'][code] for b in batches)
            assert actual[code] == free[code] + reserved
            if trace:
                positions.append([day, code, initial[code], initial[code] - actual[code], actual[code], reserved, free[code]])
        all_settled = sum(a['net'] for a in allocations if a['settle'] <= day)
        assert sum(b['cash'] + b['paid'] for b in batches) == all_settled
        assert all(b['cash'] >= 0 for b in batches)
    summaries = []
    for bi, b in enumerate(batches):
        duration = CAL.index(b['pay_day']) - CAL.index(b['day']) + 1 if b['pay_day'] else None
        summaries.append(dict(batch=bi + 1, request=b['day'], benchmark=b['benchmark'], gross=b['gross'], fee=b['fee'],
                              net=b['net'], paid=b['paid'], cash=b['cash'], trade_end=b['done_day'], pay_day=b['pay_day'],
                              days=duration, pass_weekly=duration is not None and duration <= 7,
                              unsold=sum(b['goal'][c] - b['sold'][c] for c in codes)))
    assert sum(t['gross'] - sum(t['fees']) for t in tickets) == sum(b['net'] for b in batches)
    result = dict(rate=rate, scale=scale, summaries=summaries, passed=all(b['pass_weekly'] for b in summaries),
                  gross=sum(b['gross'] for b in batches), fee=sum(b['fee'] for b in batches),
                  net=sum(b['net'] for b in batches), paid=sum(b['paid'] for b in batches),
                  tickets_n=len(tickets), actual=actual)
    if trace:
        result.update(tickets=tickets, allocations=allocations, capacity=capacity, positions=positions, cash_rows=cash_rows, targets=targets)
    return result


def verify(holds, market):
    base = static(holds, market)
    # 规模网格属于所交研究的必要工作，不作为反复自证的多轮基准测试。
    runs = {(p, s): simulate(holds, market, p, s, trace=(s == 1)) for s in SCALES for p in RATES}
    base_runs = [runs[p, D(1)] for p in RATES]
    feasible = [s for s in SCALES if runs[D('.30'), s]['passed']]
    best = max(feasible) if feasible else None
    common = base_runs[2]
    checks = {}
    modes = ['ADV包含当日', '只用ADV60', '忽略当日容量', '各批独享容量', '重复预留',
             '尾单当日完成', '尾单不折价', '按批重复计费', '旧结算费', '成交即现金', '自然日交收']
    for mode in modes:
        changed = simulate(holds, market, D('.30'), mode=mode)
        shifts = [[a['batch'], a['pay_day'], b['pay_day']] for a, b in zip(common['summaries'], changed['summaries']) if a['pay_day'] != b['pay_day']]
        item = dict(net_delta=changed['net'] - common['net'], fee_delta=changed['fee'] - common['fee'], payment_date_changes=shifts,
                    stock_changes=sum(common['actual'][c] != changed['actual'][c] for c in common['actual']))
        assert any([item['net_delta'], item['fee_delta'], shifts, item['stock_changes']]), (mode, '未触发边界')
        checks[mode] = item
    assert any(len([a for a in common['allocations'] if a['ticket'] == t['id']]) > 1 for t in common['tickets']), '没有跨批汇总单'
    assert any(t['route'] == '尾单' for t in common['tickets']), '没有尾单'
    assert any(t['fees'][0] == 18 for t in common['tickets']), '未踩最低佣金'
    assert allocate_fee(D('.01'), [D(1), D(1)]) == [D('.01'), D(0)]
    assert fees(D('5000000'))[-1] == D('210.00')
    assert CAL[CAL.index('2026-10-16') + 2] == '2026-10-21'
    info = dict(static_total=base['total'], static_days=base['scenario'], best_scale=best,
                baseline=[{k: v for k, v in r.items() if k in ['rate', 'gross', 'fee', 'net', 'paid', 'tickets_n', 'summaries']} for r in base_runs],
                grid_points=len(runs), baseline_capacity_rows=sum(len(r['capacity']) for r in base_runs),
                baseline_allocation_rows=sum(len(r['allocations']) for r in base_runs), sensitivity=checks)
    print(json.dumps(info, ensure_ascii=False, default=str, indent=2))


def pack():
    files = sorted(ATT.iterdir())
    assert len(files) == 9 and all(f.is_file() for f in files)
    assert all(f.stat().st_size < 20 * 1024 * 1024 for f in files)
    for f in files:
        if f.suffix == '.pdf':
            doc = fitz.open(f)
            assert len(doc) and all(p.get_text().strip() for p in doc)
            doc.close()
        elif f.suffix == '.xlsx':
            w = load_workbook(f, read_only=True)
            assert w.sheetnames
            w.close()
    path = HERE / '港股连续赎回_附件包.zip'
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in files:
            z.write(f, f.name)
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None and all('/' not in n for n in z.namelist())
    print('附件包：', path, '文件数：', len(files), '字节：', path.stat().st_size)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pack-only', action='store_true', help='只检查并打包现有附件，不再次运行内部参照')
    parser.add_argument('--extend-grid', action='store_true', help='仅验证补入的5%、10%、15%规模点，不重复既有基准和敏感性')
    args = parser.parse_args()
    if not args.pack_only:
        holds, market, provenance, original = load_sources()
        generate(holds, market, provenance, original)
        if args.extend_grid:
            extra = []
            for scale in [D('.05'), D('.10'), D('.15')]:
                for rate in RATES:
                    r = simulate(holds, market, rate, scale)
                    extra.append({k: r[k] for k in ['scale', 'rate', 'passed', 'net', 'fee', 'summaries']})
            print(json.dumps(extra, ensure_ascii=False, default=str, indent=2))
        else:
            verify(holds, market)
    pack()


if __name__ == '__main__':
    main()
