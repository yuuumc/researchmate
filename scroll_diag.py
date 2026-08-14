"""滚动到诊断报告底部，截图补强方案"""
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

    # 获取页面总高度
    total_height = page.evaluate("() => document.body.scrollHeight")
    print(f"页面总高度: {total_height}")

    # 逐步滚动并截图
    for i, pos in enumerate(range(1500, total_height, 800)):
        page.evaluate(f"window.scrollTo(0, {pos})")
        page.wait_for_timeout(1000)
        page.screenshot(path=rf"C:\Users\Administrator\Desktop\yanxintong\screenshots\diag_scroll_{i}.png")

        # 获取当前可见区域文本
        visible_text = page.evaluate('''() => {
            const selection = window.getSelection();
            return document.body.innerText;
        }''')

        if '补强' in visible_text or 'remediation' in visible_text.lower():
            print(f"在位置 {pos} 找到'补强'")
            # 提取补强方案附近文本
            idx = visible_text.find('补强')
            if idx >= 0:
                print(f"上下文: ...{visible_text[max(0,idx-100):idx+500]}...")

    # 滚到底部
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\diag_bottom.png")

    # 获取整个页面文本，找补强方案
    full_text = page.evaluate("() => document.body.innerText")
    if '补强' in full_text:
        idx = full_text.find('补强')
        print(f"\n补强方案内容:\n{full_text[idx:idx+800]}")
    else:
        print("\n页面中未找到'补强'关键字")
        # 打印最后2000字符
        print(f"\n页面底部文本:\n{full_text[-2000:]}")

    context.close()
