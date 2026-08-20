"""截图补强方案区域"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

USER_DATA_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\.playwright_profile")

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=str(USER_DATA_DIR),
        headless=True,
        viewport={"width": 1920, "height": 1080},
        locale="zh-CN"
    )
    page = context.pages[0] if context.pages else context.new_page()
    page.goto("https://researchmate.researchkit.online/diagnosis", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(8000)

    # 滚动到补强方案区域
    remediation = page.locator('.remediation').first
    if remediation.count() > 0:
        remediation.scroll_into_view_if_needed()
        page.wait_for_timeout(2000)
        page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\remediation_fixed.png")

        # 获取补强方案文本
        text = page.evaluate('''() => {
            const el = document.querySelector('.remediation');
            return el ? el.innerText : 'not found';
        }''')
        print("补强方案内容:")
        print(text[:2000])

        # 检查是否有原始JSON
        has_json = '"step"' in text or '"action"' in text
        print(f"\n包含原始JSON: {has_json}")
    else:
        print("未找到 .remediation 元素")
        # 尝试其他选择器
        page.evaluate("window.scrollTo(0, document.body.scrollHeight/2)")
        page.wait_for_timeout(1000)
        page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\diagnosis_mid.png")

    context.close()
