"""
研芯通 Aily 本地监控脚本 v2
- 每15分钟检查 Aily 任务页面最新消息
- 检测登录态是否有效
- 将最新消息保存到 monitor_status.json
- 如有新消息追加到 monitor.log
"""
import json
import time
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

BASE_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong")
USER_DATA_DIR = BASE_DIR / ".playwright_profile"
STATUS_FILE = BASE_DIR / "monitor_status.json"
LOG_FILE = BASE_DIR / "monitor.log"
TASK_URL = "https://aily.feishu.cn/tasks/7670091085749800211"

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def main():
    log("--- 开始监控检查 ---")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=True,
            viewport={"width": 1920, "height": 1080},
            locale="zh-CN"
        )
        page = context.pages[0] if context.pages else context.new_page()

        try:
            page.goto(TASK_URL, wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(12000)

            current_url = page.url
            # 登录态检测：等待足够时间后仍在登录页才算失效
            if "accounts.feishu.cn" in current_url or "login" in current_url:
                page.wait_for_timeout(5000)
                current_url = page.url
                if "accounts.feishu.cn" in current_url:
                    status = {
                        "check_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "logged_in": False,
                        "action_needed": "Aily 登录态已过期，请运行 aily_login.py 重新扫码"
                    }
                    with open(STATUS_FILE, "w", encoding="utf-8") as f:
                        json.dump(status, f, ensure_ascii=False, indent=2)
                    log("登录态失效，需要重新扫码")
                    return

            # 滚动到底部加载最新消息
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(3000)

            body_text = page.evaluate("() => document.body.innerText")
            lines = [l.strip() for l in body_text.split("\n") if l.strip() and len(l.strip()) > 5]
            recent_lines = lines[-30:]

            status = {
                "check_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "logged_in": True,
                "url": current_url,
                "recent_lines": recent_lines,
                "action_needed": "OK"
            }
            with open(STATUS_FILE, "w", encoding="utf-8") as f:
                json.dump(status, f, ensure_ascii=False, indent=2)

            log(f"检查完成，获取{len(recent_lines)}条最近消息")
            for line in recent_lines[-5:]:
                log(f"  > {line[:100]}")

        except Exception as e:
            log(f"错误: {e}")
            with open(STATUS_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "check_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "error": str(e),
                    "action_needed": "监控脚本出错"
                }, f, ensure_ascii=False, indent=2)
        finally:
            context.close()

if __name__ == "__main__":
    main()
