"""
研芯通 Aily 本地监控脚本
- 用 Playwright 无头浏览器检查 Aily 最新消息
- 如果全栈说已修复补强方案，自动重跑视觉验证
- 结果写入 status.json 和 monitor.log
"""
import json
import time
import re
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

BASE_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong")
USER_DATA_DIR = BASE_DIR / ".playwright_profile"
SCREENSHOT_DIR = BASE_DIR / "screenshots"
STATUS_FILE = BASE_DIR / "monitor_status.json"
LOG_FILE = BASE_DIR / "monitor.log"
TASK_URL = "https://aily.feishu.cn/tasks/7670091085749800211"
PRODUCT_URL = "https://researchmate.researchkit.online"

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")

def save_status(status):
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(status, f, ensure_ascii=False, indent=2)

def check_aily(page):
    """检查 Aily 最新消息"""
    log("访问 Aily...")
    page.goto(TASK_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(10000)

    if "accounts.feishu.cn" in page.url:
        log("登录态失效，需要重新扫码")
        return {"logged_in": False, "messages": []}

    # 滚动到底部
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(3000)

    # 获取页面底部文本
    body_text = page.evaluate("() => document.body.innerText")
    bottom_text = body_text[-5000:]

    # 提取关键信息
    messages = []

    # 检查是否有"修复完成"、"已修复"、"部署"等关键词
    fix_keywords = ["已修复", "修复完成", "已部署", "部署完成", "vercel --prod", "已提交", "commit", "push"]
    fix_mentioned = any(kw in bottom_text for kw in fix_keywords)

    # 检查全栈开发工程师的状态
    dev_running = "正在执行" in bottom_text or "正在排队" in bottom_text

    # 提取最近的执行结果
    if "执行完成" in bottom_text:
        # 找最后一个"执行完成"附近的文本
        idx = bottom_text.rfind("执行完成")
        context = bottom_text[max(0, idx-2000):idx+500]
        messages.append(context.strip())

    # 提取最新的几条消息摘要
    lines = bottom_text.split('\n')
    recent = [l.strip() for l in lines if l.strip() and len(l.strip()) > 10][-20:]
    messages.extend(recent)

    page.screenshot(path=str(SCREENSHOT_DIR / "monitor_aily.png"))

    return {
        "logged_in": True,
        "fix_mentioned": fix_mentioned,
        "dev_running": dev_running,
        "recent_lines": recent,
        "bottom_text": bottom_text[-2000:]
    }

def verify_remediation(page):
    """重新验证补强方案渲染"""
    log("重新验证补强方案渲染...")
    page.goto(PRODUCT_URL, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(5000)

    # 登录
    email_input = page.locator('input[type="email"], input[placeholder*="邮箱"], input[name="email"]').first
    if email_input.is_visible(timeout=5000):
        email_input.fill("xueba@yanxintong-test.com")
        pwd_input = page.locator('input[type="password"]').first
        pwd_input.fill("Test1234!")
        page.locator('button:has-text("登录"), button[type="submit"]').first.click()
        page.wait_for_timeout(8000)

    # 去诊断页
    page.goto(f"{PRODUCT_URL}/diagnosis", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(5000)

    # 生成报告
    gen_btn = page.locator('button:has-text("生成个性化诊断报告"), button:has-text("重新生成诊断报告")').first
    if gen_btn.is_visible(timeout=5000):
        gen_btn.click()
        log("等待报告生成...")
        page.wait_for_selector('text=重新生成诊断报告', timeout=120000)
        page.wait_for_timeout(5000)

    # 滚动到补强方案
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)

    # 检查补强方案
    result = page.evaluate('''() => {
        const rem = document.querySelector('.remediation-text');
        if (!rem) return {found: false, text: '', hasRawJson: false};
        const text = rem.innerText;
        const hasRawJson = text.includes('"step"') || text.includes('"action"') || text.includes('{') && text.includes('}');
        return {found: true, text: text.substring(0, 500), hasRawJson: hasRawJson};
    }''')

    page.screenshot(path=str(SCREENSHOT_DIR / "monitor_remediation.png"))

    return result

def main():
    log("=" * 50)
    log("开始监控检查")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=True,
            viewport={"width": 1920, "height": 1080},
            locale="zh-CN"
        )

        page = context.pages[0] if context.pages else context.new_page()

        try:
            aily_result = check_aily(page)

            status = {
                "check_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "logged_in": aily_result["logged_in"],
                "fix_mentioned": aily_result.get("fix_mentioned", False),
                "dev_running": aily_result.get("dev_running", False),
                "verification": None,
                "beta_ready": False
            }

            if not aily_result["logged_in"]:
                status["action_needed"] = "需要重新扫码登录飞书"
                save_status(status)
                log("登录态失效")
                context.close()
                return

            # 如果提到修复，重新验证
            if aily_result.get("fix_mentioned"):
                log("检测到修复相关消息，重新验证...")
                verification = verify_remediation(page)
                status["verification"] = verification

                if verification["found"] and not verification["hasRawJson"]:
                    log("✅ 补强方案渲染已修复！")
                    status["beta_ready"] = True
                    status["action_needed"] = "补强方案已修复，Beta 7/7 通过，可以开跑！"
                elif verification["found"] and verification["hasRawJson"]:
                    log("❌ 补强方案仍显示原始JSON")
                    status["action_needed"] = "补强方案仍未修复"
                else:
                    log("未找到补强方案元素")
                    status["action_needed"] = "未找到补强方案元素，可能页面结构变化"
            else:
                if aily_result.get("dev_running"):
                    status["action_needed"] = "全栈开发工程师正在修复中，继续等待"
                    log("全栈正在执行中")
                else:
                    status["action_needed"] = "暂无新进展"
                    log("暂无修复相关消息")

            save_status(status)
            log(f"状态: {status['action_needed']}")

        except Exception as e:
            log(f"错误: {e}")
            save_status({
                "check_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "error": str(e),
                "action_needed": "监控脚本出错，请手动检查"
            })
        finally:
            context.close()

if __name__ == "__main__":
    main()
