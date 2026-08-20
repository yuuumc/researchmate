"""探索 Aily - 用 domcontentloaded 和更长超时"""
import time
from playwright.sync_api import sync_playwright

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
    page = context.new_page()

    log("访问 Aily...")
    try:
        page.goto("https://aily.feishu.cn/tasks/7670091085749800211", wait_until="domcontentloaded", timeout=60000)
        log(f"URL: {page.url}")
        log(f"标题: {page.title()}")
        page.wait_for_timeout(5000)
        log(f"5秒后 URL: {page.url}")
        log(f"5秒后 标题: {page.title()}")
        page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_headless.png", full_page=True)
        content = page.content()
        log(f"页面内容长度: {len(content)}")
        # 打印body文本
        body_text = page.evaluate("() => document.body.innerText.substring(0, 3000)")
        log(f"页面文本:\n{body_text}")
    except Exception as e:
        log(f"错误: {e}")
        try:
            page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_error.png")
        except:
            pass

    browser.close()
