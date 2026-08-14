"""
精确检查补强方案渲染：滚动到该区域，截图+提取DOM文本
"""
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

    # 登录
    log("登录...")
    page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
    page.locator('input[type="email"]').first.fill(EMAIL)
    page.locator('input[type="password"]').first.fill(PASSWORD)
    page.locator('button:has-text("登录"), button[type="submit"]').first.click()
    page.wait_for_timeout(5000)

    # 到诊断页
    log("导航到诊断页...")
    page.goto(f"{BASE_URL}/diagnosis", wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(3000)

    # 生成报告
    log("生成诊断报告...")
    page.locator('button:has-text("生成个性化诊断报告"), button:has-text("重新生成诊断报告")').first.click()
    page.wait_for_selector('text=重新生成诊断报告', timeout=60000)
    page.wait_for_timeout(3000)
    log("报告生成完成")

    # 滚动到补强方案
    log("滚动到补强方案区域...")
    remediation = page.locator('text=补强方案').first
    remediation.scroll_into_view_if_needed()
    page.wait_for_timeout(1000)
    page.screenshot(path=str(SCREENSHOT_DIR / "headless_remediation_detail.png"))

    # 精确提取补强方案区域的HTML和文本
    log("提取补强方案DOM...")
    remediation_info = page.evaluate('''() => {
        // 找到"补强方案"标题元素
        const allElements = document.querySelectorAll('*');
        let titleEl = null;
        for (const el of allElements) {
            if (el.childNodes.length > 0) {
                for (const node of el.childNodes) {
                    if (node.nodeType === 3 && node.textContent.includes('补强方案')) {
                        titleEl = el;
                        break;
                    }
                }
            }
            if (titleEl) break;
        }

        if (!titleEl) return {error: '未找到补强方案标题'};

        // 向上找到容器
        let container = titleEl;
        for (let i = 0; i < 5; i++) {
            if (container.parentElement) container = container.parentElement;
        }

        return {
            titleTag: titleEl.tagName,
            containerTag: container.tagName,
            containerClass: container.className,
            containerText: container.textContent.substring(0, 3000),
            containerHTML: container.innerHTML.substring(0, 5000),
            // 检查是否有 [object Object]
            hasObjectObject: container.textContent.includes('[object Object]'),
            // 检查是否有原始JSON
            hasRawJson: container.textContent.includes('"step"') || container.textContent.includes('"action"'),
        };
    }''')

    log(f"补强方案标题标签: {remediation_info.get('titleTag')}")
    log(f"容器标签: {remediation_info.get('containerTag')}.{remediation_info.get('containerClass')}")
    log(f"含[object Object]: {remediation_info.get('hasObjectObject')}")
    log(f"含原始JSON: {remediation_info.get('hasRawJson')}")
    log(f"\n容器文本内容:\n{remediation_info.get('containerText', 'N/A')[:2000]}")

    # 保存HTML
    html_file = SCREENSHOT_DIR / "remediation_html.txt"
    with open(html_file, "w", encoding="utf-8") as f:
        f.write(remediation_info.get('containerHTML', 'N/A'))
    log(f"\nHTML已保存: {html_file}")

    # 同样检查根因链
    log("\n检查根因链...")
    root_cause_info = page.evaluate('''() => {
        const allElements = document.querySelectorAll('*');
        let titleEl = null;
        for (const el of allElements) {
            if (el.childNodes.length > 0) {
                for (const node of el.childNodes) {
                    if (node.nodeType === 3 && node.textContent.includes('根因链')) {
                        titleEl = el;
                        break;
                    }
                }
            }
            if (titleEl) break;
        }
        if (!titleEl) return {error: '未找到根因链标题'};
        let container = titleEl;
        for (let i = 0; i < 5; i++) {
            if (container.parentElement) container = container.parentElement;
        }
        return {
            hasObjectObject: container.textContent.includes('[object Object]'),
            textPreview: container.textContent.substring(0, 1500)
        };
    }''')
    log(f"根因链含[object Object]: {root_cause_info.get('hasObjectObject')}")
    log(f"根因链文本:\n{root_cause_info.get('textPreview', 'N/A')[:1000]}")

    # 检查就业指导页面
    log("\n导航到就业指导...")
    # 点击侧边栏就业指导
    emp_link = page.locator('text=就业指导').first
    if emp_link.is_visible(timeout=3000):
        emp_link.click()
        page.wait_for_timeout(5000)
        page.screenshot(path=str(SCREENSHOT_DIR / "headless_employment_detail.png"), full_page=True)

        emp_info = page.evaluate('''() => {
            const content = document.body.textContent;
            return {
                hasObjectObject: content.includes('[object Object]'),
                hasRawJson: content.includes('"skill"') || content.includes('"gap"') || content.includes('"name"'),
                url: window.location.href,
                textPreview: content.substring(0, 2000)
            };
        }''')
        log(f"就业指导URL: {emp_info.get('url')}")
        log(f"含[object Object]: {emp_info.get('hasObjectObject')}")
        log(f"含原始JSON: {emp_info.get('hasRawJson')}")
        log(f"文本预览:\n{emp_info.get('textPreview', 'N/A')[:1500]}")
    else:
        log("未找到就业指导链接")

    browser.close()
    log("\n完成")
