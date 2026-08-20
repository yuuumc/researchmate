"""截图查看 Aily 当前状态"""
from playwright.sync_api import sync_playwright
from pathlib import Path

profile = Path(r"C:\Users\Administrator\Desktop\yanxintong\.playwright_profile")
screenshot = Path(r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_status.png")

with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(str(profile), headless=True, viewport={"width": 1920, "height": 1080}, locale="zh-CN")
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://aily.feishu.cn/tasks/7670091085749800211", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(12000)
    # 滚动到底部
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)
    page.screenshot(path=str(screenshot), full_page=False)
    print(f"Screenshot saved: {screenshot}")
    # 检查是否有"执行中"或"思考中"
    body_text = page.inner_text("body")
    if "执行中" in body_text or "思考中" in body_text or "运行中" in body_text:
        print("STATUS: 正在执行中")
    elif "执行失败" in body_text[-2000:]:
        print("STATUS: 最近执行失败")
    else:
        print("STATUS: 空闲或已完成")
    ctx.close()
