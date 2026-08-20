"""截图补强方案区域（滚动main容器）"""
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

    # 滚动main容器到补强方案位置
    page.evaluate('''() => {
        const main = document.querySelector('main.yx-content');
        if (main) {
            // 找到补强方案元素
            const all = main.querySelectorAll('*');
            for (const el of all) {
                if (el.textContent.includes('补强方案') && el.children.length < 5) {
                    el.scrollIntoView({block: 'start'});
                    return;
                }
            }
            main.scrollTop = main.scrollHeight * 0.7;
        }
    }''')
    page.wait_for_timeout(2000)
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\remediation_fixed_final.png")

    # 也截根因链
    page.evaluate('''() => {
        const main = document.querySelector('main.yx-content');
        if (main) {
            const all = main.querySelectorAll('*');
            for (const el of all) {
                if (el.textContent.includes('根因链') && el.children.length < 5) {
                    el.scrollIntoView({block: 'start'});
                    return;
                }
            }
            main.scrollTop = main.scrollHeight * 0.5;
        }
    }''')
    page.wait_for_timeout(2000)
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\rootcause_fixed_final.png")

    print("截图完成")
    context.close()
