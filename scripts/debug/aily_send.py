"""
Aily 自动发送消息脚本
使用 pyautogui 在豆包浏览器中自动向 Aily 对话框发送消息

用法:
  python aily_send.py "消息内容"
  python aily_send.py --file message.txt
  python aily_send.py --monitor  # 仅截图监控，不发送消息
"""

import sys
import time
import os
import pyautogui
import pyperclip
import ctypes
import ctypes.wintypes
from datetime import datetime

# 配置
SCREENSHOT_DIR = r"C:\Users\Administrator\Desktop\yanxintong\screenshots"
BROWSER_WINDOW_TITLE = "处理研芯通项目移交"  # 窗口标题包含此字符串即认为是Aily页面
INPUT_X = 900       # 输入框点击 X 坐标 (2560x1600 屏幕)
INPUT_Y = 1420      # 输入框点击 Y 坐标
SEND_X = 1790       # 发送按钮 X 坐标
SEND_Y = 1470       # 发送按钮 Y 坐标

# 安全设置：pyautogui 防故障（鼠标移到左上角可紧急停止）
pyautogui.FAILSAFE = True
pyautogui.PAUSE = 0.3


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def find_browser_window():
    """查找豆包浏览器窗口"""
    user32 = ctypes.windll.user32
    result = []

    def callback(hwnd, lparam):
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buf = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buf, length + 1)
            title = buf.value
            if "豆包浏览器" in title or "研芯通" in title or "aily" in title.lower():
                result.append((hwnd, title))
        return True

    enum_proc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
    user32.EnumWindows(enum_proc(callback), 0)
    return result


def bring_to_front(hwnd):
    """将窗口置于前台"""
    user32 = ctypes.windll.user32
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    time.sleep(0.3)
    user32.ShowWindow(hwnd, 3)  # SW_MAXIMIZE
    time.sleep(0.5)
    user32.SetForegroundWindow(hwnd)
    time.sleep(1)


def send_message(message, wait_after=5):
    """发送消息到 Aily 对话框"""
    ensure_dir(SCREENSHOT_DIR)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # 查找并激活浏览器窗口
    windows = find_browser_window()
    if not windows:
        print("错误: 未找到豆包浏览器窗口，请先打开 Aily 页面")
        return False

    hwnd, title = windows[0]
    print(f"找到窗口: {title}")
    bring_to_front(hwnd)

    # 点击输入框
    print(f"点击输入框 ({INPUT_X}, {INPUT_Y})...")
    pyautogui.click(INPUT_X, INPUT_Y)
    time.sleep(0.8)

    # 全选并清除已有内容（以防万一）
    pyautogui.hotkey('ctrl', 'a')
    time.sleep(0.2)

    # 通过剪贴板粘贴消息
    print("输入消息...")
    pyperclip.copy(message)
    time.sleep(0.3)
    pyautogui.hotkey('ctrl', 'v')
    time.sleep(1)

    # 截图确认消息已输入
    screenshot = pyautogui.screenshot()
    before_send = os.path.join(SCREENSHOT_DIR, f"before_send_{timestamp}.png")
    screenshot.save(before_send)
    print(f"发送前截图: {before_send}")

    # 点击发送按钮
    print(f"点击发送 ({SEND_X}, {SEND_Y})...")
    pyautogui.click(SEND_X, SEND_Y)
    time.sleep(wait_after)

    # 截图确认消息已发送
    screenshot = pyautogui.screenshot()
    after_send = os.path.join(SCREENSHOT_DIR, f"after_send_{timestamp}.png")
    screenshot.save(after_send)
    print(f"发送后截图: {after_send}")

    print("消息发送完成!")
    return True


def monitor():
    """仅截图监控当前页面状态"""
    ensure_dir(SCREENSHOT_DIR)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    # 查找并激活浏览器窗口
    windows = find_browser_window()
    if windows:
        hwnd, title = windows[0]
        bring_to_front(hwnd)

    screenshot = pyautogui.screenshot()
    filepath = os.path.join(SCREENSHOT_DIR, f"monitor_{timestamp}.png")
    screenshot.save(filepath)
    print(f"监控截图: {filepath}")
    return filepath


def scroll_down():
    """向下滚动页面查看新内容"""
    pyautogui.scroll(-500)
    time.sleep(0.5)


def scroll_up():
    """向上滚动页面"""
    pyautogui.scroll(500)
    time.sleep(0.5)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "--monitor":
        monitor()
    elif sys.argv[1] == "--file":
        if len(sys.argv) < 3:
            print("请指定文件路径")
            sys.exit(1)
        with open(sys.argv[2], 'r', encoding='utf-8') as f:
            msg = f.read().strip()
        send_message(msg)
    elif sys.argv[1] == "--scroll-down":
        scroll_down()
        monitor()
    elif sys.argv[1] == "--scroll-up":
        scroll_up()
        monitor()
    else:
        send_message(sys.argv[1])
