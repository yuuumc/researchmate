"""探索 Aily 对话框结构"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

USER_DATA_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\.playwright_profile")
TASK_URL = "https://aily.feishu.cn/tasks/7670091085749800211"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=str(USER_DATA_DIR),
        headless=True,
        viewport={"width": 1920, "height": 1080},
        locale="zh-CN"
    )

    page = context.pages[0] if context.pages else context.new_page()
    page.goto(TASK_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(8000)

    # 截图
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_explore.png", full_page=False)

    # 查找 contentEditable 元素
    editables = page.query_selector_all('[contenteditable="true"], [contenteditable=""]')
    log(f"找到 {len(editables)} 个 contentEditable 元素")
    for i, el in enumerate(editables):
        tag = el.evaluate("e => e.tagName")
        cls = el.evaluate("e => e.className")
        placeholder = el.get_attribute("data-placeholder") or el.get_attribute("placeholder") or ""
        text = el.evaluate("e => e.innerText.substring(0, 100)")
        rect = el.bounding_box()
        log(f"  [{i}] <{tag}> class='{cls}' placeholder='{placeholder}' text='{text}' rect={rect}")

    # 查找可能的发送按钮
    buttons = page.query_selector_all('button, [role="button"], [class*="send"], [class*="submit"]')
    log(f"\n找到 {len(buttons)} 个按钮")
    for i, btn in enumerate(buttons):
        tag = btn.evaluate("e => e.tagName")
        cls = btn.evaluate("e => e.className")
        text = btn.evaluate("e => e.innerText.substring(0, 50)")
        aria = btn.get_attribute("aria-label") or ""
        rect = btn.bounding_box()
        if rect and rect["y"] > 600:  # 只看底部区域的按钮
            log(f"  [{i}] <{tag}> class='{cls[:80]}' text='{text}' aria='{aria}' rect={rect}")

    # 查找 textarea
    textareas = page.query_selector_all('textarea')
    log(f"\n找到 {len(textareas)} 个 textarea")
    for i, ta in enumerate(textareas):
        cls = ta.evaluate("e => e.className")
        placeholder = ta.get_attribute("placeholder") or ""
        rect = ta.bounding_box()
        log(f"  [{i}] class='{cls[:80]}' placeholder='{placeholder}' rect={rect}")

    # 查找输入区域附近的元素
    log("\n查找输入区域...")
    input_area = page.evaluate('''() => {
        const results = [];
        // 查找所有可能的输入容器
        const candidates = document.querySelectorAll('[class*="input"], [class*="chat"], [class*="message"], [class*="editor"], [class*="composer"]');
        candidates.forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.y > 500 && rect.width > 200) {
                results.push({
                    tag: el.tagName,
                    class: el.className.substring(0, 100),
                    id: el.id,
                    rect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height}
                });
            }
        });
        return results.slice(0, 20);
    }''')
    for item in input_area:
        log(f"  {item}")

    context.close()
