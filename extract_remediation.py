"""精确提取补强方案区域的DOM结构"""
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\screenshots")
BASE_URL = "https://researchmate.researchkit.online"
EMAIL = "xueba@yanxintong-test.com"
PASSWORD = "Test1234!"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
    page = context.new_page()

    # 登录+生成报告
    page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
    page.locator('input[type="email"]').first.fill(EMAIL)
    page.locator('input[type="password"]').first.fill(PASSWORD)
    page.locator('button:has-text("登录"), button[type="submit"]').first.click()
    page.wait_for_timeout(5000)
    page.goto(f"{BASE_URL}/diagnosis", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)
    page.locator('button:has-text("生成个性化诊断报告"), button:has-text("重新生成诊断报告")').first.click()
    page.wait_for_selector('text=重新生成诊断报告', timeout=60000)
    page.wait_for_timeout(3000)
    log("报告生成完成")

    # 精确找到补强方案区域
    remediation_html = page.evaluate('''() => {
        // 找到所有包含"补强方案"文本的元素
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.includes('补强方案')) {
                // 找到包含这个文本节点的最近的有意义的容器
                let el = node.parentElement;
                // 向上找，直到找到包含JSON内容的容器
                let container = el;
                for (let i = 0; i < 10; i++) {
                    if (container.parentElement) {
                        container = container.parentElement;
                        const text = container.textContent;
                        if (text.includes('"step"') && text.includes('"action"')) {
                            // 找到了包含JSON的容器，继续向上找section
                            let section = container;
                            while (section.parentElement && !section.querySelector(':scope > .section-head, :scope > h2, :scope > h3')) {
                                section = section.parentElement;
                                if (section.tagName === 'SECTION' || section.tagName === 'MAIN') break;
                            }
                            return {
                                found: true,
                                containerTag: container.tagName,
                                containerClass: container.className,
                                containerHTML: container.outerHTML.substring(0, 8000),
                                parentTag: container.parentElement?.tagName,
                                parentClass: container.parentElement?.className,
                            };
                        }
                    }
                }
                return {found: true, elTag: el.tagName, elClass: el.className, elHTML: el.outerHTML.substring(0, 3000), noJson: true};
            }
        }
        return {found: false};
    }''')

    if remediation_html.get('found'):
        log(f"容器: {remediation_html.get('containerTag')}.{remediation_html.get('containerClass')}")
        log(f"父元素: {remediation_html.get('parentTag')}.{remediation_html.get('parentClass')}")
        html = remediation_html.get('containerHTML', '')
        log(f"HTML长度: {len(html)}")
        log(f"\nHTML内容:\n{html[:5000]}")

        with open(SCREENSHOT_DIR / "remediation_element.html", "w", encoding="utf-8") as f:
            f.write(html)
        log(f"\nHTML已保存")
    else:
        log("未找到补强方案")

    # 同时获取API响应 - 拦截网络请求看AI返回了什么
    log("\n重新生成报告并拦截API响应...")

    # 监听网络请求
    api_responses = []
    def handle_response(response):
        if '/api/chat' in response.url or '/api/diagnosis' in response.url:
            try:
                body = response.text()
                api_responses.append({'url': response.url, 'status': response.status, 'body': body[:5000]})
            except:
                pass

    page.on('response', handle_response)

    # 点击重新生成
    page.locator('button:has-text("重新生成诊断报告")').first.click()
    page.wait_for_timeout(40000)

    log(f"捕获到 {len(api_responses)} 个API响应")
    for i, resp in enumerate(api_responses):
        log(f"\n--- 响应 {i+1} ---")
        log(f"URL: {resp['url']}")
        log(f"Status: {resp['status']}")
        body = resp['body']
        log(f"Body (前3000字符):\n{body[:3000]}")

        # 搜索 remediation 字段
        if 'remediation' in body.lower() or '补强' in body:
            log(">>> 包含补强/remediation字段!")
            # 找到该字段
            import re
            match = re.search(r'"remediation"\s*:\s*(\[.*?\]|\{.*?\}|"[^"]*")', body, re.DOTALL)
            if match:
                log(f"remediation字段值: {match.group(0)[:1000]}")

    browser.close()
    log("完成")
