"""检查 Aily 最新消息"""
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
    page.wait_for_timeout(10000)

    # 滚动到底部看最新消息
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(3000)

    # 获取最新消息
    messages = page.evaluate('''() => {
        const msgs = [];
        // 查找所有消息元素
        const elements = document.querySelectorAll('[class*="message"], [class*="chat-item"], [class*="msg"]');
        elements.forEach(el => {
            const text = el.innerText;
            if (text && text.length > 20 && text.length < 5000) {
                const rect = el.getBoundingClientRect();
                if (rect.top > 0) {
                    msgs.push(text.substring(0, 1000));
                }
            }
        });
        return msgs.slice(-10);
    }''')

    log(f"找到 {len(messages)} 条消息")
    for i, msg in enumerate(messages):
        log(f"\n--- 消息 {i+1} ---")
        log(msg[:500])

    # 也获取整个页面的底部文本
    body_text = page.evaluate("() => document.body.innerText")
    # 取最后3000字符
    log(f"\n\n=== 页面底部文本（最后3000字符）===")
    log(body_text[-3000:])

    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_latest.png", full_page=False)

    context.close()
