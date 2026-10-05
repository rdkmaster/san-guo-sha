# -*- coding: utf-8 -*-
"""
抓取 三国杀移动版WIKI (wiki.biligame.com/msgs) 全部武将信息与图片。
输出:
  - 武将图鉴.json  (全部武将数据)
  - 素材/武将/  下 each general's 头像 + 经典形象图片
用法:
  python scrap_generals.py            # 完整抓取(支持断点续抓)
  python scrap_generals.py --test     # 只抓 5 个武将做解析验证
"""
import json
import os
import re
import sys
import time
import html as htmllib
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://wiki.biligame.com/msgs/api.php"
ROOT = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(ROOT, "素材", "武将")
OUT_JSON = os.path.join(ROOT, "武将图鉴.json")
PROGRESS = os.path.join(ROOT, "_progress.jsonl")
HEADERS = [("User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")]
THUMB_WIDTH = 1600  # 经典形象长边像素; 改成 None 则下载原图

_opener = urllib.request.build_opener()
_opener.addheaders = HEADERS

import threading
_lock = threading.Lock()
_min_interval = 0.6  # 全局最小请求间隔(秒), 规避wiki限流
_next_time = time.time()
_backoff = 30       # 遇到567限流时的全局冷却时间, 会自适应增长


def _pace():
    global _next_time
    with _lock:
        now = time.time()
        wait = _next_time - now
        if wait > 0:
            time.sleep(wait)
        _next_time = time.time() + _min_interval


def get(url, retries=6):
    global _backoff
    for i in range(retries):
        _pace()
        try:
            req = urllib.request.Request(url, headers={
                "Referer": "https://wiki.biligame.com/msgs/",
            })
            data = _opener.open(req, timeout=40).read()
            return data
        except urllib.error.HTTPError as e:
            if e.code in (567, 429, 503):
                # 全局冷却: 所有线程一起等待限流解除
                with _lock:
                    cool = _backoff
                    _next_time = time.time() + cool
                    _backoff = min(_backoff * 2, 300)
                print(f"[限流] {e.code}, 全局冷却 {cool}s...", flush=True)
                time.sleep(cool + 1)
                continue
            if i == retries - 1:
                raise
            time.sleep(2 + 2 * i)
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(2 + 2 * i)


def get_json(params):
    params = dict(params, format="json", formatversion="2")
    raw = get(API + "?" + urllib.parse.urlencode(params))
    try:
        d = json.loads(raw.decode("utf-8"))
        global _backoff
        with _lock:
            _backoff = max(30, _backoff // 2)  # 成功后冷却衰减
        return d
    except ValueError:
        # 非JSON = 被WAF拦截, 走长冷却
        with _lock:
            cool = _backoff
            _next_time = time.time() + cool
            _backoff = min(_backoff * 2, 300)
        print(f"[WAF] 非JSON响应, 全局冷却 {cool}s...", flush=True)
        raise RuntimeError("waf block")


def strip_tags(s):
    s = re.sub(r"(?is)<(style|script).*?</\1>", "", s)
    s = re.sub(r"(?i)<(br|/p|/div|/li|/h[1-6]|/tr)[^>]*>", "\n", s)
    s = re.sub(r"(?s)<[^>]+>", "", s)
    s = htmllib.unescape(s)
    s = re.sub(r"[ \t\r\xa0]+", "", s)
    s = re.sub(r"\n{2,}", "\n", s)
    return s.strip()


def clean_value(s):
    return strip_tags(s).replace("\n", " ").strip()


# ---------------- 1. 武将列表 ----------------

def get_all_generals():
    names, cont = [], None
    while True:
        params = {"action": "query", "list": "categorymembers",
                  "cmtitle": "分类:武将", "cmlimit": "500"}
        if cont:
            params["cmcontinue"] = cont
        d = get_json(params)
        for m in d["query"]["categorymembers"]:
            if m["ns"] == 0:
                names.append(m["title"])
        cont = d.get("continue", {}).get("cmcontinue")
        if not cont:
            break
    return sorted(set(names))


# ---------------- 2. 解析单个武将页面 ----------------

def parse_page(title, html_text):
    data = {"name": title}
    text = strip_tags(html_text)

    m = re.search(r"武将称号：([^\n]+)", text)
    data["subtitle"] = m.group(1).strip() if m else None

    m = re.search(r"(?:^|\n)性别\n?(男|女)\n", text)
    data["gender"] = m.group(1) if m else None

    m = re.search(r"(?:^|\n)势力\n?([^\n]+)", text)
    data["kingdom"] = m.group(1).strip() if m else None

    m = re.search(r"(?:^|\n)别称\n?([^\n]+)", text)
    data["alias"] = m.group(1).strip() if m else None

    # 体力: 勾玉图片后的隐藏 span
    m = re.search(r'勾玉\.png[^>]*>(?:\s*</span>)?\s*<span style="display:none;">([^<]*)</span>',
                  html_text)
    if not m:  # 兜底: 数勾玉
        i = html_text.find("266px")
        block = html_text[i:i + 9000] if i >= 0 else ""
        n = len(re.findall(r"勾玉\.png", block))
        m2 = re.search(r"</span><span style=\"display:none;\">([^<]*)</span>", block)
        hp_text = m2.group(1).strip() if m2 else (str(n) if n else None)
    else:
        hp_text = m.group(1).strip()
    data["hpText"] = hp_text or None
    if hp_text:
        try:
            data["hp"] = float(hp_text)
            data["hp"] = int(data["hp"]) if data["hp"].is_integer() else data["hp"]
        except ValueError:
            data["hp"] = None
    else:
        data["hp"] = None

    # 基本信息(在"经典"小节之前): 武将包/上线时间/品质/定位/获取方式
    m = re.search(r"(?:^|\n)武将包\n?([^\n]+)", text)
    data["pack"] = m.group(1).strip() if m else None
    m = re.search(r"(?:^|\n)上线时间\n?([^\n]+)", text)
    data["releaseDate"] = m.group(1).strip() if m else None
    m = re.search(r"(?:^|\n)品质\n?([^\n]+)", text)
    if not m:  # 品质以徽章图片形式出现在经典形象图块内
        i = html_text.find("266px")
        region = html_text[i:i + 9000] if i >= 0 else ""
        m = re.search(r'alt="((?:史诗|传说|普通|稀有|限定|绝版)\.png)"', region)
        data["quality"] = m.group(1).replace(".png", "") if m else None
    else:
        data["quality"] = m.group(1).strip()
    m = re.search(r"(?:^|\n)定位\n?([^\n]+)", text)
    data["positioning"] = m.group(1).strip() if m else None
    m = re.search(r"(?:^|\n)获取方式\n?([^\n]+)", text)
    if not m:
        m = re.search(r"【武将获取方式[:：]([^】]+)】", text)
    data["acquire"] = m.group(1).strip() if m else None

    # 出现模式 (身份/国战/欢乐 勾/叉)
    modes = re.findall(r'gold-title-color">([^<]+)</div><i class="fa-(check|times) ', html_text)
    if not modes:
        modes = re.findall(r'gold-title-color">([^<]+)</div><i class="fa-(check|times)', html_text)
    data["modes"] = {k: (v == "check") for k, v in modes} if modes else None

    # 画师: 经典形象图底部叠加层
    m = re.search(r'经典形象[^"]*" class="box-round-corner.*?border-bottom-right-radius: 8px;">([^<]+)<',
                  html_text, re.S)
    if not m:
        m = re.search(r'border-bottom-right-radius: 8px;?\">([^<]+)</div>', html_text)
    data["painter"] = m.group(1).strip() if m else None

    # 技能 / 台词 行: 名称(带链接) + 描述, 按 台词 区分节
    voice_idx = html_text.find(">台词<")
    rows = []
    for mm in re.finditer(
            r'<div class="basic-info-row-label"[^>]*>.*?title="([^"]*)"[^>]*>.*?</a></div>\s*'
            r'<div[^>]*>(.*?)</div>', html_text, re.S):
        rows.append((mm.group(1), mm.group(2), mm.start() < voice_idx))

    def parse_desc(raw):
        tm = re.match(r'\s*(?:<b>((?:[^<]|<(?=/b))*)</b>\s*)*', raw)
        type_str = ""
        seg = raw
        types = []
        while True:
            m2 = re.match(r'\s*<b>([^<]*)</b>\s*', seg)
            if not m2:
                break
            t = m2.group(1).strip().rstrip("，,。")
            if t:
                types.append(t)
            seg = seg[m2.end():]
            if not seg.lstrip().startswith("<b>"):
                break
        if types:
            type_str = "，".join(types)
        desc = strip_tags(seg).replace("\n", "").strip()
        return type_str or None, desc

    # 技能区在台词区之前
    skills, seen = [], set()
    for name, raw, is_skill in rows:
        if not is_skill or name in seen:
            continue
        label, desc = parse_desc(raw)
        if not desc:
            continue
        seen.add(name)
        skills.append({"name": name, "type": label, "text": desc})
    # 阵亡台词单独取
    m = re.search(r"阵亡\n([^\n]+)", text)
    if m:
        data["deathLine"] = m.group(1).strip()
    else:
        data["deathLine"] = None
    data["skills"] = skills

    # 台词: 行结构同技能区
    voices = []
    for name, raw, is_skill in rows:
        if is_skill:
            continue
        label, desc = parse_desc(raw)
        if not desc:
            continue
        voices.append({"name": name, "text": desc})
    data["voiceLines"] = voices or None

    # 故事 / 其他 / FAQ ("其他"段落截掉底部重复的分享卡片块)
    m = re.search(r"\n其他\n(.*)", text, re.S)
    notes = m.group(1).strip() if m else None
    if notes:
        cut = re.search(rf"\n{re.escape(title)}\n", notes)
        if cut:
            notes = notes[:cut.start()].strip()
    data["notes"] = notes
    m = re.search(r"\n经典形象故事\n([^\n]+)", text)
    data["story"] = m.group(1).strip() if m else None

    # 皮肤表 (皮肤名含品质/画师/静态获取/动态获取)
    skins = []
    si = html_text.find('id="皮肤"')
    if si >= 0:
        for tr in re.findall(r"(?is)<tr>(.*?)</tr>", html_text[si:]):
            tds = [strip_tags(td).replace("\n", " ").strip() for td in re.findall(r"(?is)<td[^>]*>(.*?)</td>", tr)]
            tds = [t for t in tds if t]
            if len(tds) >= 4 and not tds[0] in ("皮肤名",):
                name_cell = tds[0]
                quality = None
                for q in ("限定", "传说", "史诗", "稀有", "普通"):
                    if name_cell.startswith(q):
                        quality, name_cell = q, name_cell[len(q):].strip()
                        break
                skins.append({"quality": quality, "name": name_cell,
                              "painter": tds[1], "staticAcquire": tds[2], "dynamicAcquire": tds[3]})
    data["skins"] = skins or None

    faqs = re.findall(r"【Q】(.*?)\n【A】(.*?)(?=\n【Q】|\n词条|$)", text, re.S)
    data["faq"] = [{"q": q.strip(), "a": a.strip()} for q, a in faqs] or None
    return data


def fetch_general(title):
    d = get_json({"action": "parse", "page": title, "prop": "text"})
    html_text = d["parse"]["text"]
    data = parse_page(title, html_text)
    # 图片候选
    cands = [f"文件:{title}-头像.png", f"文件:{title}-头像.jpg",
             f"文件:{title}-经典形象.jpg", f"文件:{title}-经典形象.png"]
    info = get_json({"action": "query", "titles": "|".join(cands),
                     "prop": "imageinfo", "iiprop": "url|size"})
    imgs = {}
    for p in info["query"]["pages"]:
        if "imageinfo" in p:
            t = p["title"].replace("文件:", "")
            imgs[t] = p["imageinfo"][0]["url"]
    data["imageUrls"] = imgs
    return data


# ---------------- 3. 图片下载 ----------------

def safe_name(name):
    return re.sub(r'[\\/:*?"<>|]', "_", name)


def build_url(orig, width):
    """把原图 URL 转成指定宽度的缩略图 URL"""
    m = re.match(r"(.*/images/msgs)/(\w)/(\w)/([^/]+)$", orig)
    if not m:
        return orig
    base, a, b, fn = m.groups()
    fn = urllib.parse.unquote(fn)
    quoted = urllib.parse.quote(fn)
    return f"{base}/thumb/{a}/{b}/{fn}/{width}px-{quoted}"


def download(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return "skip"
    # 图片走独立CDN(patchwiki), 无需全局限速
    for i in range(4):
        try:
            req = urllib.request.Request(url, headers={"Referer": "https://wiki.biligame.com/msgs/"})
            data = _opener.open(req, timeout=60).read()
            with open(path, "wb") as f:
                f.write(data)
            return "ok"
        except Exception:
            if i == 3:
                raise
            time.sleep(1 + i)


# ---------------- main ----------------

def main():
    test = "--test" in sys.argv
    only = None
    for a in sys.argv[1:]:
        if a.startswith("--only="):
            only = a.split("=", 1)[1]

    print("获取武将列表...", flush=True)
    names = get_all_generals()
    print(f"共 {len(names)} 个武将", flush=True)
    if test:
        names = names[:5]
    if only:
        names = [n for n in names if n == only]

    os.makedirs(IMG_DIR, exist_ok=True)

    # 断点续抓: 已解析过的跳过
    done = {}
    if os.path.exists(PROGRESS):
        with open(PROGRESS, encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                    done[r["name"]] = r
                except Exception:
                    pass
    todo = [n for n in names if n not in done]
    print(f"待解析 {len(todo)} 个 (已完成 {len(done)})", flush=True)

    fails = []
    with ThreadPoolExecutor(max_workers=3) as ex:
        futs = {ex.submit(fetch_general, n): n for n in todo}
        for i, fut in enumerate(as_completed(futs), 1):
            n = futs[fut]
            try:
                data = fut.result()
                done[n] = data
                with open(PROGRESS, "a", encoding="utf-8") as f:
                    f.write(json.dumps(data, ensure_ascii=False) + "\n")
            except Exception as e:
                fails.append((n, str(e)))
            if i % 25 == 0:
                print(f"解析进度 {i}/{len(todo)}, 失败 {len(fails)}", flush=True)

    print(f"解析完成, 失败 {len(fails)}: {fails[:10]}", flush=True)

    # 下载图片
    tasks = []  # (url, path)
    for n, data in done.items():
        if only and n != only:
            continue
        sn = safe_name(n)
        for t, url in (data.get("imageUrls") or {}).items():
            if "-头像" in t:
                path = os.path.join(IMG_DIR, f"{sn}-头像{os.path.splitext(t)[1]}")
            elif "-经典形象" in t:
                path = os.path.join(IMG_DIR, f"{sn}-经典形象{os.path.splitext(t)[1]}")
            else:
                continue
            if THUMB_WIDTH and "-头像" not in os.path.basename(path):
                u = build_url(url, THUMB_WIDTH)
            else:
                u = url
            tasks.append((u, path))
    print(f"待下载图片 {len(tasks)} 张", flush=True)

    dl_fails = []
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(download, u, p): (u, p) for u, p in tasks}
        for i, fut in enumerate(as_completed(futs), 1):
            u, p = futs[fut]
            try:
                fut.result()
            except Exception as e:
                dl_fails.append((os.path.basename(p), str(e)[:120]))
            if i % 100 == 0:
                print(f"下载进度 {i}/{len(tasks)}, 失败 {len(dl_fails)}", flush=True)
    print(f"下载完成, 失败 {len(dl_fails)}: {dl_fails[:10]}", flush=True)

    # 组装输出 JSON
    cards = []
    for n in sorted(done):
        data = dict(done[n])
        if only and n != only:
            continue
        sn = safe_name(n)
        img_urls = data.pop("imageUrls", {}) or {}
        rel = []
        for t in sorted(img_urls):
            base = os.path.splitext(t)[0]
            ext = os.path.splitext(t)[1]
            if base.endswith("-头像"):
                rel.append(f"素材/武将/{sn}-头像{ext}")
            elif base == "经典形象" or base.endswith("-经典形象"):
                rel.append(f"素材/武将/{sn}-经典形象{ext}")
        data["images"] = rel
        cards.append(data)

    out = {
        "source": "https://wiki.biligame.com/msgs/武将图鉴 (三国杀移动版WIKI)",
        "scrapedAt": time.strftime("%Y-%m-%d"),
        "count": len(cards),
        "cards": cards,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"已写入 {OUT_JSON}: {len(cards)} 个武将", flush=True)


if __name__ == "__main__":
    main()
