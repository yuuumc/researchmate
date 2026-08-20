"""测试 Aily 发送机制 - 先输入短消息看发送按钮是否出现"""
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

    editor = page.locator('[contenteditable="true"]').first
    editor.click()
    page.wait_for_timeout(500)

    # 方法1: 用 keyboard.type 输入短消息
    log("输入短消息 'test'...")
    page.keyboard.type("test", delay=50)
    page.wait_for_timeout(2000)

    # 检查按钮变化
    btns = page.evaluate('''() => {
        const results = [];
        document.querySelectorAll('button').forEach(btn => {
            const rect = btn.getBoundingClientRect();
            if (rect.y > 950 && rect.y < 1100 && rect.x > 500 && rect.width > 0) {
                results.push({
                    testid: btn.getAttribute('data-testid') || '',
                    aria: btn.getAttribute('aria-label') || '',
                    disabled: btn.disabled,
                    svg: btn.querySelector('svg') ? btn.querySelector('svg').outerHTML.substring(0, 300) : 'no-svg'
                });
            }
        });
        return results;
    }''')
    log("输入后按钮状态:")
    for b in btns:
        log(f"  testid={b['testid']} aria={b['aria']} disabled={b['disabled']}")
        log(f"  svg: {b['svg'][:200]}")

    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_test_typed.png")

    # 检查输入框内容
    text = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
    log(f"输入框内容: '{text}'")

    # 尝试 Enter
    log("按 Enter...")
    page.keyboard.press("Enter")
    page.wait_for_timeout(3000)

    text_after = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
    log(f"Enter后内容: '{text_after}'")

    if text_after.strip() == 'test' or text_after.strip() == '':
        log("Enter 没有发送也没有换行")
    elif '\n' in text_after or text_after != text:
        log("Enter 创建了新行，说明 Enter 是换行")

    # 如果Enter是换行，试试 Ctrl+Enter
    if text_after.strip():
        log("按 Ctrl+Enter...")
        page.keyboard.press("Control+Enter")
        page.wait_for_timeout(3000)
        text_final = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
        log(f"Ctrl+Enter后内容: '{text_final}'")

    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_test_after.png")

    # 清空输入框
    page.evaluate('''() => {
        const editor = document.querySelector('[contenteditable="true"]');
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('delete', false);
    }''')

    context.close()
