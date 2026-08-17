"""调试：检查三档账号的 profile 数据和诊断输入"""
import json
from playwright.sync_api import sync_playwright

BASE_URL = "https://researchmate.researchkit.online"

ACCOUNTS = [
    {"name": "学霸", "email": "xueba@yanxintong-test.com", "password": "Test1234!"},
    {"name": "中等", "email": "zhongdeng@yanxintong-test.com", "password": "Test1234!"},
    {"name": "差生", "email": "chasheng@yanxintong-test.com", "password": "Test1234!"},
]

def debug_account(p, account):
    print(f"\n{'='*50}")
    print(f"调试 {account['name']} ({account['email']})")
    print(f"{'='*50}")

    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
    page = context.new_page()

    try:
        # 登录
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        email_input = page.locator('input[type="email"]').first
        if email_input.is_visible(timeout=5000):
            email_input.fill(account["email"])
            page.locator('input[type="password"]').first.fill(account["password"])
            page.locator('button:has-text("登录"), button[type="submit"]').first.click()
            page.wait_for_timeout(8000)

        # 去诊断页
        page.goto(f"{BASE_URL}/diagnosis", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(5000)

        # 检查所有 localStorage
        all_storage = page.evaluate("""() => {
            const result = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const val = localStorage.getItem(key);
                try {
                    result[key] = JSON.parse(val);
                } catch(e) {
                    result[key] = val.substring(0, 200);
                }
            }
            return result;
        }""")

        print("  localStorage keys:", list(all_storage.keys()))
        for key, val in all_storage.items():
            if "profile" in key.lower() or "auth" in key.lower() or "yanxin" in key.lower():
                print(f"\n  [{key}]:")
                print(f"  {json.dumps(val, ensure_ascii=False, indent=2)[:2000]}")

        # 拦截 /api/agent 请求，查看实际发送的 input
        api_input = None
        def handle_request(request):
            nonlocal api_input
            if "/api/agent" in request.url and request.method == "POST":
                try:
                    post_data = request.post_data
                    if post_data:
                        api_input = json.loads(post_data)
                except:
                    pass

        page.on("request", handle_request)

        # 点击生成诊断
        gen_btn = page.locator('button:has-text("生成个性化诊断报告"), button:has-text("重新生成诊断报告")').first
        if gen_btn.is_visible(timeout=5000):
            gen_btn.click()
            page.wait_for_selector('text=重新生成诊断报告', timeout=90000)
            page.wait_for_timeout(3000)

        if api_input:
            print(f"\n  发送到 /api/agent 的 input:")
            print(f"  {json.dumps(api_input, ensure_ascii=False, indent=2)[:3000]}")
        else:
            print("\n  ⚠️ 未捕获到 /api/agent 请求")

    except Exception as e:
        print(f"  错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        context.close()
        browser.close()

with sync_playwright() as p:
    for acc in ACCOUNTS:
        debug_account(p, acc)
