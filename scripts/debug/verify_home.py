"""验证首页优势/薄弱点/阶段是否动态显示"""
import re, time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = "https://researchmate.researchkit.online"
SCREENSHOT_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\screenshots")

ACCOUNTS = [
    {"name": "学霸", "email": "xueba@yanxintong-test.com", "password": "Test1234!"},
    {"name": "中等", "email": "zhongdeng@yanxintong-test.com", "password": "Test1234!"},
    {"name": "差生", "email": "chasheng@yanxintong-test.com", "password": "Test1234!"},
]

def verify(p, account):
    print(f"\n{'='*50}")
    print(f"验证 {account['name']} 首页")
    print(f"{'='*50}")

    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
    page = context.new_page()

    try:
        # 登录
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        page.locator('input[type="email"]').first.fill(account["email"])
        page.locator('input[type="password"]').first.fill(account["password"])
        page.locator('button:has-text("登录"), button[type="submit"]').first.click()
        page.wait_for_timeout(8000)

        # 首页
        page.goto(BASE_URL + "/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(5000)

        # 提取导师卡文本
        mentor_card = page.locator('.mentor-status-card').first
        card_text = mentor_card.inner_text()
        print(f"导师卡内容:\n{card_text}")

        # 检查是否还有硬编码
        has_hardcoded = "3 个优势" in card_text or "2 个薄弱点" in card_text or "微电子基础学习期" in card_text
        print(f"硬编码残留: {'❌ 是' if has_hardcoded else '✅ 否'}")

        # 提取数字
        m1 = re.search(r'(\d+)\s*个优势', card_text)
        m2 = re.search(r'(\d+)\s*个薄弱点', card_text)
        m3 = re.search(r'当前阶段[：:]\s*(.+)', card_text)
        m4 = re.search(r'今日建议[：:]\s*(.+)', card_text)

        strengths = int(m1.group(1)) if m1 else "?"
        weaks = int(m2.group(1)) if m2 else "?"
        stage = m3.group(1).strip() if m3 else "?"
        suggestion = m4.group(1).strip() if m4 else "?"

        print(f"优势: {strengths}, 薄弱: {weaks}, 阶段: {stage}, 建议: {suggestion}")

        # 截图
        page.screenshot(path=str(SCREENSHOT_DIR / f"home_{account['name']}.png"))

        return {"account": account["name"], "strengths": strengths, "weaks": weaks,
                "stage": stage, "suggestion": suggestion, "hardcoded": has_hardcoded}

    except Exception as e:
        print(f"错误: {e}")
        import traceback; traceback.print_exc()
        return {"account": account["name"], "error": str(e)}
    finally:
        context.close()
        browser.close()

with sync_playwright() as p:
    results = []
    for acc in ACCOUNTS:
        results.append(verify(p, acc))
        time.sleep(2)

    print(f"\n{'='*60}")
    print("汇总")
    print(f"{'='*60}")
    for r in results:
        if "error" in r:
            print(f"{r['account']}: ERROR - {r['error']}")
        else:
            print(f"{r['account']}: {r['strengths']}优势/{r['weaks']}薄弱 | {r['stage']} | {r['suggestion']} | {'❌硬编码' if r['hardcoded'] else '✅'}")
