"""检查三档账号实际的 ability_stars 数据"""
from playwright.sync_api import sync_playwright

BASE_URL = "https://researchmate.researchkit.online"

ACCOUNTS = [
    {"name": "学霸", "email": "xueba@yanxintong-test.com", "password": "Test1234!"},
    {"name": "中等", "email": "zhongdeng@yanxintong-test.com", "password": "Test1234!"},
    {"name": "差生", "email": "chasheng@yanxintong-test.com", "password": "Test1234!"},
]

with sync_playwright() as p:
    for acc in ACCOUNTS:
        print(f"\n{'='*50}")
        print(f"{acc['name']} ({acc['email']})")
        print(f"{'='*50}")

        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
        page = context.new_page()

        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)
        page.locator('input[type="email"]').first.fill(acc["email"])
        page.locator('input[type="password"]').first.fill(acc["password"])
        page.locator('button:has-text("登录"), button[type="submit"]').first.click()
        page.wait_for_timeout(8000)

        # 读取 localStorage profile
        profile_json = page.evaluate("() => localStorage.getItem('researchmate_profile')")
        if profile_json:
            import json
            profile = json.loads(profile_json)
            stars = profile.get("ability_stars", {})
            weak_topics = profile.get("weak_topics", [])
            mastered_topics = profile.get("mastered_topics", [])
            print(f"ability_stars ({len(stars)} topics):")
            for k, v in sorted(stars.items(), key=lambda x: x[1]):
                print(f"  {k}: {v}")
            vals = list(stars.values())
            print(f"  4-5星: {sum(1 for v in vals if v >= 4)}")
            print(f"  1-2星: {sum(1 for v in vals if 0 < v <= 2)}")
            print(f"  avg: {sum(vals)/len(vals):.2f}" if vals else "  avg: N/A")
            print(f"weak_topics ({len(weak_topics)}): {weak_topics}")
            print(f"mastered_topics ({len(mastered_topics)}): {mastered_topics}")
        else:
            print("No profile in localStorage")

        context.close()
        browser.close()
