"""
研芯通生产冒烟测试 - 6项API检查
"""
import urllib.request
import urllib.error
import json
import time
import re
import csv
from datetime import datetime

BASE = "https://researchmate.researchkit.online"
ORIGIN = "https://researchmate.researchkit.online"
TIMEOUT = 60

results = []

def check(num, name, passed, detail):
    results.append({
        "check": num,
        "name": name,
        "pass": passed,
        "detail": detail,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    status = "PASS" if passed else "FAIL"
    print(f"[{num}/6] {name}: {status} - {detail}")

def post_chat(mode, prompt, timeout=TIMEOUT):
    body = json.dumps({
        "mode": mode,
        "prompt": prompt,
        "userInput": prompt
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}/api/chat",
        data=body,
        headers={"Origin": ORIGIN, "Content-Type": "application/json"},
        method="POST"
    )
    start = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read().decode("utf-8")
        elapsed = time.time() - start
        return resp.status, data, elapsed

# 检查1: HTTPS 200 + 页面标题
print("=" * 60)
print("研芯通生产冒烟测试 - 6项API检查")
print("=" * 60)
print()

print("[1/6] HTTPS 200 + 页面标题...")
try:
    req = urllib.request.Request(BASE, headers={"Origin": ORIGIN})
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="replace")
        title_match = re.search(r"<title>(.*?)</title>", html)
        title = title_match.group(1) if title_match else "未找到"
        title_norm = re.sub(r"\s+", "", title)
        passed = resp.status == 200 and title_norm == "研芯通·工科考研专业知识智能体"
        check(1, "HTTPS+标题", passed, f"状态码={resp.status}, 标题={title}")
except Exception as e:
    check(1, "HTTPS+标题", False, str(e))

# 检查2: CORS预检
print("[2/6] CORS预检 OPTIONS /api/chat...")
try:
    req = urllib.request.Request(
        f"{BASE}/api/chat",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"
        },
        method="OPTIONS"
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        check(2, "CORS预检", resp.status == 204, f"状态码={resp.status}")
except urllib.error.HTTPError as e:
    check(2, "CORS预检", e.code == 204, f"状态码={e.code}")
except Exception as e:
    check(2, "CORS预检", False, str(e))

# 检查3-5: 三种模式
modes = [
    (3, "diagnosis", "诊断流程", "我是一名工科考研学生，想考电子信息专业，请帮我诊断"),
    (4, "mentor", "导师流程", "请推荐电子信息专业的导师选择建议"),
    (5, "planning", "规划流程", "请帮我制定考研复习规划"),
]

for num, mode, name, prompt in modes:
    print(f"[{num}/6] {name} (mode={mode})...")
    try:
        status, data, elapsed = post_chat(mode, prompt)
        has_content = len(data) > 50
        no_object_object = "[object Object]" not in data
        no_raw_json = not re.search(r'\[?\{[\s]*"', data[:200]) if len(data) > 200 else True
        passed = status == 200 and has_content and no_object_object
        detail = f"状态码={status}, 耗时={elapsed:.1f}s, 长度={len(data)}, 无[object Object]={no_object_object}"
        check(num, name, passed, detail)
        # Print preview for diagnosis
        if mode == "diagnosis":
            print(f"  响应预览: {data[:300]}...")
    except Exception as e:
        check(num, name, False, str(e))

# 检查6: 高频切换5次
print("[6/6] 高频切换5次交替调用...")
try:
    test_modes = ["diagnosis", "mentor", "planning", "diagnosis", "mentor"]
    test_prompts = ["诊断测试1", "导师测试1", "规划测试1", "诊断测试2", "导师测试2"]
    all_pass = True
    times = []
    for i, (m, p) in enumerate(zip(test_modes, test_prompts)):
        status, data, elapsed = post_chat(m, p, timeout=30)
        times.append(f"{elapsed:.1f}")
        ok = status == 200 and elapsed < 30
        if not ok:
            all_pass = False
        print(f"  第{i+1}次 ({m}): {status}, {elapsed:.1f}s")
    check(6, "高频切换", all_pass, f"耗时: {', '.join(times)}s")
except Exception as e:
    check(6, "高频切换", False, str(e))

# 汇总
print()
print("=" * 60)
pass_count = sum(1 for r in results if r["pass"])
print(f"汇总: {pass_count}/6 通过")
print("=" * 60)
for r in results:
    icon = "✅" if r["pass"] else "❌"
    print(f"  {icon} {r['check']}. {r['name']}: {r['detail']}")

# 保存结果
csv_path = r"C:\Users\Administrator\Desktop\yanxintong\smoke_api_results.csv"
with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=["check", "name", "pass", "detail", "timestamp"])
    writer.writeheader()
    writer.writerows(results)
print(f"\n结果已保存: {csv_path}")
