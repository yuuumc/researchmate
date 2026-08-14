"""
Aily 一次性登录脚本 - 打开可见浏览器，用户扫码后保存会话
之后所有操作都可以用 headless 模式复用这个会话
"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

# 持久化用户数据目录 - 保存登录态
USER_DATA_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\.playwright_profile")
USER_DATA_DIR.mkdir(parents=True, exist_ok=True)

TASK_URL = "https://aily.feishu.cn/tasks/7670091085749800211"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

log("启动浏览器（可见窗口）...")
log("请在弹出的浏览器窗口中用飞书 App 扫码登录")
log("登录成功后浏览器会自动关闭")

with sync_playwright() as p:
    # 使用持久化上下文，保存登录态
    context = p.chromium.launch_persistent_context(
        user_data_dir=str(USER_DATA_DIR),
        headless=False,
        viewport={"width": 1280, "height": 900},
        locale="zh-CN",
        args=["--disable-blink-features=AutomationControlled"]
    )

    page = context.pages[0] if context.pages else context.new_page()

    log("导航到 Aily 任务页...")
    page.goto(TASK_URL, wait_until="domcontentloaded", timeout=60000)

    # 等待登录成功 - 检测URL离开登录页
    log("等待扫码登录...")
    max_wait = 180  # 最多等3分钟
    start = time.time()
    logged_in = False

    while time.time() - start < max_wait:
        current_url = page.url
        if "accounts.feishu.cn" not in current_url and "passport" not in current_url:
            # 可能已登录，等页面加载
            page.wait_for_timeout(3000)
            current_url = page.url
            if "accounts.feishu.cn" not in current_url and "passport" not in current_url:
                logged_in = True
                break
        time.sleep(2)

    if logged_in:
        log(f"登录成功！当前URL: {page.url}")
        page.wait_for_timeout(3000)
        # 截图确认
        page.screenshot(path=str(Path(r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_logged_in.png")))
        log("会话已保存，关闭浏览器")
    else:
        log("登录超时，请重新运行脚本")

    context.close()

log("完成！后续可以使用无头模式操作 Aily")
