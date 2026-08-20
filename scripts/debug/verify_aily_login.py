"""验证 Aily 持久登录态是否有效"""
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

    log("访问 Aily 任务页...")
    page.goto(TASK_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(8000)

    current_url = page.url
    title = page.title()
    log(f"URL: {current_url}")
    log(f"标题: {title}")

    if "accounts.feishu.cn" in current_url or "passport" in current_url:
        log(">>> 未登录，需要重新扫码")
    else:
        log(">>> 已登录！")
        page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_headless_loggedin.png", full_page=True)
        body_text = page.evaluate("() => document.body.innerText.substring(0, 3000)")
        log(f"页面文本:\n{body_text}")

    context.close()
