"""查看 Aily 完整对话历史"""
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
    page.wait_for_timeout(15000)

    if "accounts.feishu.cn" in page.url:
        log("登录态失效")
        context.close()
        exit(1)

    log(f"当前URL: {page.url}")

    # 获取整个对话区域文本
    full_text = page.evaluate("() => document.body.innerText")

    # 保存完整文本
    with open(r"C:\Users\Administrator\Desktop\yanxintong\aily_conversation.txt", "w", encoding="utf-8") as f:
        f.write(full_text)

    log(f"完整对话长度: {len(full_text)} 字符")

    # 打印关键部分
    # 找"补强方案"、"修复"、"remediation"、"部署"相关内容
    lines = full_text.split('\n')
    for i, line in enumerate(lines):
        if any(kw in line for kw in ['修复', 'remediation', '补强', '部署', 'commit', 'vercel', '已完成', '执行失败', '额度', 'agent error']):
            start = max(0, i-2)
            end = min(len(lines), i+3)
            for j in range(start, end):
                if lines[j].strip():
                    log(f"  L{j}: {lines[j].strip()[:200]}")
            log("  ---")

    # 截图 - 先滚动到顶部看最新消息
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_full.png")

    # 滚动到中间看更多
    for scroll_pos in [0, 500, 1000, 1500, 2000]:
        page.evaluate(f"window.scrollTo(0, {scroll_pos})")
        page.wait_for_timeout(1000)

    # 滚回底部
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_bottom.png")

    context.close()
