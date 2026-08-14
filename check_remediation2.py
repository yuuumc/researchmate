"""重新生成诊断报告并完整检查补强方案"""
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
    page.wait_for_timeout(5000)

    # 点击生成报告
    btn = page.locator('button:has-text("生成个性化诊断报告"), button:has-text("重新生成诊断报告")').first
    print(f"点击按钮: {btn.inner_text()}")
    btn.click()

    # 等待报告生成
    print("等待报告生成...")
    page.wait_for_selector('text=重新生成诊断报告', timeout=120000)
    page.wait_for_timeout(8000)

    # 查找所有可滚动容器
    scroll_info = page.evaluate('''() => {
        const containers = [];
        document.querySelectorAll('*').forEach(el => {
            const style = window.getComputedStyle(el);
            if ((style.overflow === 'auto' || style.overflow === 'scroll' ||
                 style.overflowY === 'auto' || style.overflowY === 'scroll') &&
                el.scrollHeight > el.clientHeight + 10) {
                containers.push({
                    tag: el.tagName,
                    class: el.className.toString().substring(0, 100),
                    scrollHeight: el.scrollHeight,
                    clientHeight: el.clientHeight,
                    id: el.id
                });
            }
        });
        return containers;
    }''')
    print(f"\n可滚动容器: {len(scroll_info)}")
    for s in scroll_info:
        print(f"  {s['tag']}.{s['class'][:60]} scrollH={s['scrollHeight']} clientH={s['clientHeight']}")

    # 获取主内容区域
    main_content = page.evaluate('''() => {
        // 尝试找主内容区
        const main = document.querySelector('main') || document.querySelector('.main-content') ||
                     document.querySelector('[class*="content"]') || document.querySelector('[class*="main"]');
        if (main) {
            return {
                tag: main.tagName,
                class: main.className.toString().substring(0, 100),
                scrollHeight: main.scrollHeight,
                clientHeight: main.clientHeight,
                text: main.innerText.substring(0, 500)
            };
        }
        return null;
    }''')
    print(f"\n主内容区: {main_content}")

    # 尝试在主内容区滚动
    page.evaluate('''() => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = main.scrollHeight;
        window.scrollTo(0, document.body.scrollHeight);
    }''')
    page.wait_for_timeout(2000)

    # 截图
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\diag_after_gen.png")

    # 获取完整页面文本
    full_text = page.evaluate("() => document.body.innerText")
    print(f"\n页面文本长度: {len(full_text)}")

    if '补强' in full_text:
        idx = full_text.find('补强')
        print(f"\n找到'补强'在位置 {idx}:")
        print(full_text[max(0,idx-200):idx+800])
    else:
        print("\n未找到'补强'")
        # 查找根因链
        if '根因' in full_text:
            idx = full_text.find('根因')
            print(f"找到'根因'在位置 {idx}:")
            print(full_text[max(0,idx-100):idx+500])
        else:
            print("未找到'根因'")
            print(f"\n页面最后1000字符:\n{full_text[-1000:]}")

    # 也检查所有 iframe
    frames = page.frames
    print(f"\n页面 frames: {len(frames)}")
    for frame in frames:
        print(f"  frame: {frame.url}")

    context.close()
