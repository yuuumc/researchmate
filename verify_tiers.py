"""
三档账号分数梯度验证
- 学霸 xueba@yanxintong-test.com（预期 75-90）
- 中等 zhongdeng@yanxintong-test.com（预期 45-65）
- 差生 chasheng@yanxintong-test.com（预期 25-45）
"""
import json
import re
import time
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

BASE_URL = "https://researchmate.researchkit.online"
SCREENSHOT_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\screenshots")
RESULT_FILE = Path(r"C:\Users\Administrator\Desktop\yanxintong\tier_test_results.json")

ACCOUNTS = [
    {"name": "学霸", "email": "xueba@yanxintong-test.com", "password": "Test1234!", "expected": "75-90"},
    {"name": "中等", "email": "zhongdeng@yanxintong-test.com", "password": "Test1234!", "expected": "45-65"},
    {"name": "差生", "email": "chasheng@yanxintong-test.com", "password": "Test1234!", "expected": "25-45"},
]

def test_account(p, account):
    """用独立浏览器上下文测试一个账号"""
    print(f"\n{'='*50}")
    print(f"测试 {account['name']} ({account['email']})，预期 {account['expected']}")
    print(f"{'='*50}")

    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1920, "height": 1080},
        locale="zh-CN"
    )
    page = context.new_page()

    result = {"account": account["name"], "email": account["email"], "expected": account["expected"]}

    try:
        # 1. 登录
        print("  登录中...")
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        email_input = page.locator('input[type="email"]').first
        if email_input.is_visible(timeout=5000):
            email_input.fill(account["email"])
            page.locator('input[type="password"]').first.fill(account["password"])
            page.locator('button:has-text("登录"), button[type="submit"]').first.click()
            page.wait_for_timeout(8000)
        else:
            print("  已登录状态")

        # 2. 去诊断页
        print("  进入诊断页...")
        page.goto(f"{BASE_URL}/diagnosis", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(5000)

        # 3. 检查 ability_stars（从 localStorage/profile store）
        profile_data = page.evaluate("""() => {
            try {
                const raw = localStorage.getItem('yanxintong:profile');
                if (raw) return JSON.parse(raw);
            } catch(e) {}
            return null;
        }""")
        if profile_data:
            ability_stars = profile_data.get("ability_stars", {})
            mastered = profile_data.get("mastered_topics", [])
            weak = profile_data.get("weak_topics", [])
            print(f"  ability_stars: {ability_stars}")
            print(f"  mastered_topics: {mastered}")
            print(f"  weak_topics: {weak}")
            result["ability_stars"] = ability_stars
            result["mastered_topics"] = mastered
            result["weak_topics"] = weak

            # 计算 suggested_score
            if ability_stars:
                stars = list(ability_stars.values())
                avg = sum(stars) / len(stars)
                suggested = round((avg / 5) * 100)
                result["suggested_score"] = suggested
                print(f"  suggested_score: {suggested} (avg star: {avg:.1f})")

        # 4. 生成诊断报告
        gen_btn = page.locator('button:has-text("生成个性化诊断报告"), button:has-text("重新生成诊断报告")').first
        if gen_btn.is_visible(timeout=5000):
            print("  点击生成诊断报告...")
            gen_btn.click()
            print("  等待报告生成（最多90秒）...")
            page.wait_for_selector('text=重新生成诊断报告', timeout=90000)
            page.wait_for_timeout(5000)
        else:
            print("  未找到生成按钮，可能已有报告")

        # 5. 提取分数
        page_text = page.evaluate("() => document.body.innerText")

        # 尝试多种方式提取分数
        score = None

        # 方法1：查找"诊断分数"附近的数字
        m = re.search(r'诊断分数[：:]\s*(\d{1,3})', page_text)
        if m:
            score = int(m.group(1))

        # 方法2：查找大数字显示
        if score is None:
            m = re.search(r'(\d{1,3})\s*分', page_text)
            if m:
                score = int(m.group(1))

        # 方法3：从页面元素中查找
        if score is None:
            score_el = page.locator('.score-value, .diagnosis-score, [class*="score"]').first
            if score_el.is_visible(timeout=2000):
                score_text = score_el.inner_text()
                m = re.search(r'(\d{1,3})', score_text)
                if m:
                    score = int(m.group(1))

        result["score"] = score
        print(f"  >>> 诊断分数: {score}")

        # 6. 截图
        screenshot_path = SCREENSHOT_DIR / f"tier_{account['name']}.png"
        page.screenshot(path=str(screenshot_path), full_page=False)
        result["screenshot"] = str(screenshot_path)

        # 7. 检查是否有 [object Object]
        has_object_object = "[object Object]" in page_text
        result["has_object_object"] = has_object_object
        if has_object_object:
            print(f"  ⚠️ 发现 [object Object]")

    except Exception as e:
        result["error"] = str(e)
        print(f"  ❌ 错误: {e}")
        try:
            page.screenshot(path=str(SCREENSHOT_DIR / f"tier_{account['name']}_error.png"))
        except:
            pass
    finally:
        context.close()
        browser.close()

    return result

def main():
    print(f"三档分数梯度验证 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    results = []
    with sync_playwright() as p:
        for account in ACCOUNTS:
            result = test_account(p, account)
            results.append(result)
            time.sleep(3)

    # 汇总
    print(f"\n{'='*60}")
    print("汇总结果")
    print(f"{'='*60}")
    print(f"{'账号':<8} {'预期':<10} {'suggested':<12} {'实际分数':<10} {'状态'}")
    print("-" * 60)

    scores = {}
    for r in results:
        name = r["account"]
        expected = r["expected"]
        suggested = r.get("suggested_score", "?")
        score = r.get("score", "?")
        scores[name] = score

        # 判断是否在预期范围内
        try:
            lo, hi = map(int, expected.split("-"))
            ok = lo <= score <= hi
            status = "✅" if ok else "❌"
        except:
            status = "?"

        print(f"{name:<8} {expected:<10} {str(suggested):<12} {str(score):<10} {status}")

    # 检查梯度
    if all(isinstance(v, int) for v in scores.values()):
        xueba_s = scores.get("学霸", 0)
        zhongdeng_s = scores.get("中等", 0)
        chasheng_s = scores.get("差生", 0)

        print(f"\n梯度检查:")
        print(f"  学霸 > 中等: {xueba_s} > {zhongdeng_s} = {'✅' if xueba_s > zhongdeng_s else '❌'}")
        print(f"  中等 > 差生: {zhongdeng_s} > {chasheng_s} = {'✅' if zhongdeng_s > chasheng_s else '❌'}")
        print(f"  学霸-中等差: {xueba_s - zhongdeng_s}")
        print(f"  中等-差生差: {zhongdeng_s - chasheng_s}")

        gradient_ok = xueba_s > zhongdeng_s > chasheng_s and (xueba_s - zhongdeng_s) >= 15 and (zhongdeng_s - chasheng_s) >= 15
        print(f"  三档梯度（差≥15）: {'✅ 通过' if gradient_ok else '❌ 失败'}")

    # 保存结果
    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump({"test_time": datetime.now().isoformat(), "results": results}, f, ensure_ascii=False, indent=2)
    print(f"\n结果已保存到 {RESULT_FILE}")

if __name__ == "__main__":
    main()
