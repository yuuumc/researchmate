"""
Aily 发消息 v6 - keyboard.type 真实键盘输入 + Enter发送
"""
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

USER_DATA_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\.playwright_profile")
TASK_URL = "https://aily.feishu.cn/tasks/7670091085749800211"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def send_message(message):
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(USER_DATA_DIR),
            headless=True,
            viewport={"width": 1920, "height": 1080},
            locale="zh-CN"
        )

        page = context.pages[0] if context.pages else context.new_page()

        log("访问 Aily...")
        page.goto(TASK_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(8000)

        if "accounts.feishu.cn" in page.url:
            log("错误：未登录")
            context.close()
            return False

        editor = page.locator('[contenteditable="true"]').first
        editor.click()
        page.wait_for_timeout(500)

        # 先清空（用键盘全选删除）
        log("清空编辑器...")
        page.keyboard.press("Control+a")
        page.wait_for_timeout(200)
        page.keyboard.press("Delete")
        page.wait_for_timeout(500)

        # 确认清空
        text_check = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
        log(f"清空后内容: '{text_check.strip()}'")

        # 用 insert_text 插入（Playwright 方法，触发 input 事件）
        log("插入文本（insert_text）...")
        page.keyboard.insert_text(message)
        page.wait_for_timeout(2000)

        text_check = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
        log(f"insert_text 后长度: {len(text_check)}")

        if len(text_check.strip()) < 50:
            log("insert_text 失败，改用 keyboard.type...")
            # 清空重来
            page.keyboard.press("Control+a")
            page.wait_for_timeout(200)
            page.keyboard.press("Delete")
            page.wait_for_timeout(500)

            # 分段输入，每段之间等一下
            log("分段输入...")
            chunk_size = 100
            for i in range(0, len(message), chunk_size):
                chunk = message[i:i+chunk_size]
                page.keyboard.type(chunk, delay=15)
                page.wait_for_timeout(300)
                # 检查
                if i % 300 == 0:
                    current = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
                    log(f"  已输入 {i+len(chunk)}/{len(message)}, 编辑器实际长度: {len(current)}")

        page.wait_for_timeout(1000)

        # 最终检查
        final_text = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
        log(f"最终输入长度: {len(final_text)}")
        page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_ready_send.png")

        if len(final_text.strip()) < 50:
            log("输入失败")
            context.close()
            return False

        # 按 Enter 发送
        log("按 Enter 发送...")
        page.keyboard.press("Enter")
        page.wait_for_timeout(5000)

        after_text = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
        page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_sent.png")

        if not after_text.strip() or after_text.strip() == '​':
            log("消息发送成功！")
            success = True
        else:
            log(f"Enter 后仍有 {len(after_text)} 字符，可能是换行")
            # 检查是否有新消息出现在对话中
            log("等待并检查...")
            page.wait_for_timeout(5000)
            after_text2 = page.evaluate('''() => document.querySelector('[contenteditable="true"]').innerText''')
            if not after_text2.strip() or after_text2.strip() == '​':
                log("消息发送成功（延迟）！")
                success = True
            else:
                log(f"发送失败，输入框仍有内容")
                success = False

        if success:
            page.wait_for_timeout(8000)
            page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_ai_response.png")

        context.close()
        return success

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python aily_send_headless.py '消息' 或 --file msg.txt")
        sys.exit(1)

    if sys.argv[1] == "--file":
        with open(sys.argv[2], "r", encoding="utf-8") as f:
            msg = f.read().strip()
    else:
        msg = sys.argv[1]

    log(f"消息长度: {len(msg)} 字符")
    result = send_message(msg)
    sys.exit(0 if result else 1)
