# -*- coding: utf-8 -*-
"""素材整理:
1. noname 43种卡图 -> 素材/卡牌/ (替换之前混杂的33张官方wiki图)
2. 牌堆.json 重建 image 索引 (160/160 全有图)
3. 生成 武将映射.json (noname拼音id <-> 中文名, 供语音/备用图使用)
4. 清理临时脚本
"""
import json, os, shutil, re

ROOT = 'D:/Codes/三国杀'
CARD_OUT = f'{ROOT}/素材/卡牌'
NN = f'{ROOT}/libccy-noname'

# ---------- 1. 卡图 ----------
MAP = {
    '杀': 'sha', '火杀': 'sha', '雷杀': 'sha', '闪': 'shan', '桃': 'tao', '酒': 'jiu',
    '决斗': 'juedou', '过河拆桥': 'guohe', '顺手牵羊': 'shunshou', '无中生有': 'wuzhong',
    '南蛮入侵': 'nanman', '万箭齐发': 'wanjian', '桃园结义': 'taoyuan', '五谷丰登': 'wugu',
    '借刀杀人': 'jiedao', '无懈可击': 'wuxie', '火攻': 'huogong', '铁索连环': 'tiesuo',
    '兵粮寸断': 'bingliang', '乐不思蜀': 'lebu', '闪电': 'shandian',
    '诸葛连弩': 'zhuge', '青龙偃月刀': 'qinglong', '丈八蛇矛': 'zhangba',
    '贯石斧': 'guanshi', '方天画戟': 'fangtian', '麒麟弓': 'qilin', '青釭剑': 'qinggang',
    '雌雄双股剑': 'cixiong', '寒冰剑': 'hanbing', '古锭刀': 'guding', '朱雀羽扇': 'zhuque',
    '八卦阵': 'bagua', '仁王盾': 'renwang', '藤甲': 'tengjia', '白银狮子': 'baiyin',
    '赤兔': 'chitu', '大宛': 'dawan', '骅骝': 'hualiu', '绝影': 'jueying',
    '的卢': 'dilu', '爪黄飞电': 'zhuahuang', '紫骍': 'zixin',
}
os.makedirs(CARD_OUT, exist_ok=True)
# 清掉旧的wiki混搭图
for f in os.listdir(CARD_OUT):
    os.remove(os.path.join(CARD_OUT, f))
missing = []
for cn, py in MAP.items():
    src = f'{NN}/image/card/{py}.png'
    if os.path.exists(src):
        shutil.copy(src, f'{CARD_OUT}/{py}.png')
    else:
        missing.append((cn, py))
print('卡图复制完成, 缺:', missing if missing else '无')

# ---------- 2. 牌堆.json image索引 ----------
deck = json.load(open(f'{ROOT}/牌堆.json', encoding='utf-8'))
for c in deck['cards']:
    nm = c['name']
    if nm == '杀' and c.get('subtype') in ('火杀', '雷杀'):
        nm = '杀'  # 属性杀用基础杀图, 由UI按subtype着色
    c['image'] = f'素材/卡牌/{MAP[nm]}.png'
deck['cardImageNote'] = ('卡面=无名杀(noname)统一画风插画, 共43种; '
                         '火杀/雷杀复用杀的基础图并由UI按subtype着色; '
                         '卡框/花色/点数/名称由游戏代码渲染')
json.dump(deck, open(f'{ROOT}/牌堆.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('牌堆.json image索引: 全部', len(deck['cards']), '张已指向素材/卡牌/')

# ---------- 3. 武将映射 ----------
wj = json.load(open(f'{ROOT}/武将图鉴.json', encoding='utf-8'))['cards']
PREF = ('手杀',)
def norm(n):
    for p in PREF:
        if n.startswith(p):
            n = n[len(p):]
    return n

mapping = {}
cdir = f'{NN}/character'
for pack in os.listdir(cdir):
    tf = f'{cdir}/{pack}/translate.js'
    if not os.path.exists(tf):
        continue
    txt = open(tf, encoding='utf-8').read()
    for pid, cn in re.findall(r'^\s*([a-z_0-9]{2,24}):\s*"([\u4e00-\u9fa5]{1,8})"', txt, re.M):
        # 音频文件名用无前缀拼音
        mapping.setdefault(cn, {'names': set(), 'voiceId': pid.split('_')[-1]})
        mapping[cn]['names'].add(pid)

out = []
for c in wj:
    name = c['name']
    key = norm(name)
    m = mapping.get(key) or mapping.get(name)
    entry = {
        'name': name,
        'avatar': f'素材/武将/{name}-头像.png' if os.path.exists(f'{ROOT}/素材/武将/{name}-头像.png') else None,
        'art': (f'素材/武将/{name}-经典形象.jpg'
                if os.path.exists(f'{ROOT}/素材/武将/{name}-经典形象.jpg')
                else f'素材/武将/{name}-经典形象.png'
                if os.path.exists(f'{ROOT}/素材/武将/{name}-经典形象.png') else None),
        'nonameIds': sorted(m['names']) if m else [],
        'voiceId': m['voiceId'] if m else None,
        'voiceDir': f'libccy-noname/audio/skill/' if m else None,
    }
    out.append(entry)
with open(f'{ROOT}/武将映射.json', 'w', encoding='utf-8') as f:
    json.dump({'source': 'libccy-noname character/*/translate.js', 'count': len(out),
               'cards': out}, f, ensure_ascii=False, indent=1)
n_voice = sum(1 for e in out if e['voiceId'])
print(f'武将映射.json: {len(out)} 个武将, {n_voice} 个有noname语音id')

# ---------- 4. 清理 ----------
for f in ['_build_deck.py', '_audit_deck.py', '_compare_noname.py', '_cardimg4.py',
          '_scrape.log', '_patch.log', '_rows.txt', '_deck_raw.txt', '_noname_tree.txt']:
    p = os.path.join(ROOT, f)
    if os.path.exists(p):
        os.remove(p)
print('临时文件已清理')
