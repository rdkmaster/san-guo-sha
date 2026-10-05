import json, sys
sys.stdout.reconfigure(encoding='utf-8')
d = json.load(open(r'D:\Codes\三国杀\素材\牌堆.json', encoding='utf-8'))
names = ['杀','闪','桃','酒','决斗','南蛮入侵','无懈可击','过河拆桥','顺手牵羊','火攻','借刀杀人','万箭齐发','五谷丰登','乐不思蜀','兵粮寸断','闪电','无中生有','桃园结义','青龙偃月刀','藤甲','八卦阵','青釭剑','诸葛连弩','寒冰剑','麒麟弓','贯石斧','古锭刀','紫骍','骅骝','的卢','赤兔','大宛','绝影','爪黄飞电','仁王盾','白银狮子','雌雄双股剑','方天画戟','丈八蛇矛','朱雀羽扇']
for n in names:
    cards = [f"{c['suit']}{c['rank']}" for c in d['cards'] if c['name'] == n]
    if cards:
        print(n, ' '.join(cards))
