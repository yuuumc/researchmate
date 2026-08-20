"""直接设置main容器scrollTop截图补强方案"""
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
    page.wait_for_timeout(5000)

    # 如果需要生成报告
    btn = page.locator('button:has-text("生成个性化诊断报告")')
    if btn.count() > 0 and btn.first.is_visible():
        btn.first.click()
        page.wait_for_selector('text=重新生成诊断报告', timeout=120000)
        page.wait_for_timeout(8000)

    # 直接设置main容器scrollTop
    # 补强方案大约在70%位置
    for pos_name, pos in [("rootcause", 1200), ("remediation", 1800), ("bottom", 2400)]:
        page.evaluate(f'''() => {{
            const main = document.querySelector('main.yx-content');
            if (main) main.scrollTop = {pos};
        }}''')
        page.wait_for_timeout(1500)
        page.screenshot(path=rf"C:\Users\Administrator\Desktop\yanxintong\screenshots\final_{pos_name}.png")
        print(f"截图 final_{pos_name}.png (scrollTop={pos})")

    context.close()
