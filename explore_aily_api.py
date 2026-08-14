"""探索 Aily API - 用 Playwright 无头模式访问 Aily"""
import time
from playwright.sync_api import sync_playwright

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
    page = context.new_page()

    # 监听所有网络请求
    api_calls = []
    def on_request(request):
        if 'aily' in request.url or 'feishu' in request.url:
            if request.method in ('POST', 'PUT', 'PATCH') or '/api/' in request.url:
                api_calls.append({
                    'method': request.method,
                    'url': request.url,
                    'headers': dict(request.headers),
                    'post_data': request.post_data
                })

    page.on('request', on_request)

    log("访问 Aily...")
    page.goto("https://aily.feishu.cn/tasks/7670096085749800211", wait_until="networkidle", timeout=30000)
    log(f"URL: {page.url}")
    log(f"标题: {page.title()}")

    # 截图看看登录状态
    page.screenshot(path=r"C:\Users\Administrator\Desktop\yanxintong\screenshots\aily_headless_test.png")

    # 检查页面内容
    content = page.content()
    log(f"页面内容长度: {len(content)}")
    log(f"页面前2000字符: {content[:2000]}")

    # 检查是否被重定向到登录页
    if 'login' in page.url.lower() or 'passport' in page.url.lower() or '登录' in page.title():
        log(">>> 需要登录")
    else:
        log(">>> 已登录或无需登录")

    # 打印API调用
    log(f"\n捕获到 {len(api_calls)} 个API请求")
    for call in api_calls[:20]:
        log(f"  {call['method']} {call['url']}")
        if call['post_data']:
            log(f"    Body: {call['post_data'][:500]}")

    browser.close()
