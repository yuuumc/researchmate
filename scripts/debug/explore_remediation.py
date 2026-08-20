"""探索诊断报告页面结构，找补强方案区域"""
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

    # 搜索包含"补强"的元素
    result = page.evaluate('''() => {
        const all = document.querySelectorAll('*');
        const found = [];
        for (const el of all) {
            if (el.children.length === 0 && el.textContent.includes('补强')) {
                found.push({
                    tag: el.tagName,
                    class: el.className,
                    text: el.textContent.substring(0, 200),
                    parentClass: el.parentElement ? el.parentElement.className : '',
                    grandparentClass: el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement.className : ''
                });
            }
        }
        return found;
    }''')

    print(f"找到 {len(result)} 个包含'补强'的元素:")
    for r in result:
        print(f"\n  tag: {r['tag']}")
        print(f"  class: {r['class']}")
        print(f"  parent: {r['parentClass']}")
        print(f"  grandparent: {r['grandparentClass']}")
        print(f"  text: {r['text'][:150]}")

    # 也搜索"step"或"estimated_focus"或"前置"
    result2 = page.evaluate('''() => {
        const all = document.querySelectorAll('*');
        const found = [];
        for (const el of all) {
            if (el.children.length === 0 && (el.textContent.includes('前置') || el.textContent.includes('estimated_focus'))) {
                found.push({
                    tag: el.tagName,
                    class: el.className,
                    text: el.textContent.substring(0, 200)
                });
            }
        }
        return found.slice(0, 10);
    }''')

    print(f"\n\n找到 {len(result2)} 个包含'前置'的元素:")
    for r in result2:
        print(f"  class: {r['class']}, text: {r['text'][:150]}")

    # 滚动到页面中间并截图
    page.evaluate("window.scrollTo(0, 800)")
    page.wait_for_timeout(1000)
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\diagnosis_scroll1.png")

    page.evaluate("window.scrollTo(0, 1200)")
    page.wait_for_timeout(1000)
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\diagnosis_scroll2.png")

    page.evaluate("window.scrollTo(0, 1600)")
    page.wait_for_timeout(1000)
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\diagnosis_scroll3.png")

    context.close()
