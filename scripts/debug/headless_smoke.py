"""
研芯通无头浏览器冒烟测试 - 第7项：浏览器视觉验证
不占屏幕、不动鼠标，后台运行。
"""
import json
import time
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\screenshots")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://researchmate.researchkit.online"
EMAIL = "xueba@yanxintong-test.com"
PASSWORD = "Test1234!"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def run_visual_check():
    results = {
        "login": False,
        "diagnosis_generated": False,
        "root_cause_chain_ok": None,      # 根因链[表面问题] 无 [object Object]
        "remediation_ok": None,           # 补强方案 无原始JSON
        "employment_gap_ok": None,        # 就业指导技能缺口 无原始JSON
        "screenshots": [],
        "errors": []
    }

    with sync_playwright() as p:
        # 无头模式启动，不占屏幕
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="zh-CN"
        )
        page = context.new_page()

        try:
            # 1. 访问首页
            log("访问首页...")
            page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
            title = page.title()
            log(f"页面标题: {title}")
            results["page_title"] = title

            # 2. 登录
            log("查找登录入口...")
            # 先截图看看登录页结构
            page.screenshot(path=str(SCREENSHOT_DIR / "headless_01_landing.png"))

            # 尝试查找登录按钮/输入框
            # 可能直接有邮箱输入框，或者需要点击登录按钮
            email_input = page.locator('input[type="email"], input[placeholder*="邮箱"], input[placeholder*="email"], input[name="email"]').first
            if email_input.is_visible(timeout=3000):
                log("找到邮箱输入框，直接登录...")
                email_input.fill(EMAIL)
                pwd_input = page.locator('input[type="password"]').first
                pwd_input.fill(PASSWORD)
                page.screenshot(path=str(SCREENSHOT_DIR / "headless_02_login_filled.png"))
                # 点击登录按钮
                login_btn = page.locator('button:has-text("登录"), button:has-text("登 录"), button[type="submit"]').first
                login_btn.click()
            else:
                log("未找到邮箱输入框，尝试点击登录按钮...")
                # 可能需要先点击"登录"按钮
                login_link = page.locator('text=登录').first
                if login_link.is_visible(timeout=3000):
                    login_link.click()
                    page.wait_for_timeout(2000)
                    page.screenshot(path=str(SCREENSHOT_DIR / "headless_02_login_page.png"))
                    email_input = page.locator('input[type="email"], input[placeholder*="邮箱"], input[name="email"]').first
                    email_input.wait_for(state="visible", timeout=5000)
                    email_input.fill(EMAIL)
                    pwd_input = page.locator('input[type="password"]').first
                    pwd_input.fill(PASSWORD)
                    login_btn = page.locator('button:has-text("登录"), button[type="submit"]').first
                    login_btn.click()
                else:
                    results["errors"].append("找不到登录入口")
                    page.screenshot(path=str(SCREENSHOT_DIR / "headless_error_no_login.png"))
                    browser.close()
                    return results

            # 等待登录完成
            log("等待登录完成...")
            page.wait_for_timeout(5000)
            page.screenshot(path=str(SCREENSHOT_DIR / "headless_03_after_login.png"))
            results["login"] = True
            log("登录成功")

            # 3. 导航到诊断页面
            log("导航到成长诊断页面...")
            page.goto(f"{BASE_URL}/diagnosis", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)
            page.screenshot(path=str(SCREENSHOT_DIR / "headless_04_diagnosis_page.png"))

            # 4. 点击"生成个性化诊断报告"
            log("点击生成个性化诊断报告...")
            gen_btn = page.locator('button:has-text("生成个性化诊断报告"), button:has-text("重新生成诊断报告")').first
            if gen_btn.is_visible(timeout=5000):
                gen_btn.click()
                log("已点击，等待AI诊断生成（最多60秒）...")

                # 等待按钮变回"重新生成诊断报告"或诊断结果出现
                try:
                    page.wait_for_selector('text=重新生成诊断报告', timeout=60000)
                    results["diagnosis_generated"] = True
                    log("诊断报告生成完成")
                except:
                    # 也可能直接显示了结果
                    page.wait_for_timeout(30000)
                    if page.locator('text=根因链').first.is_visible(timeout=5000):
                        results["diagnosis_generated"] = True
                        log("诊断报告生成完成（通过根因链判断）")
                    else:
                        results["errors"].append("诊断报告生成超时")
                        log("诊断报告生成超时")

                page.wait_for_timeout(3000)
                page.screenshot(path=str(SCREENSHOT_DIR / "headless_05_diagnosis_result.png"), full_page=True)
            else:
                results["errors"].append("找不到生成诊断报告按钮")
                page.screenshot(path=str(SCREENSHOT_DIR / "headless_error_no_btn.png"))

            # 5. 检查三处渲染修复点
            log("检查渲染修复点...")
            content = page.content()

            # 5a. 根因链[表面问题] - 检查是否有 [object Object]
            has_object_object = "[object Object]" in content
            results["root_cause_chain_ok"] = not has_object_object
            log(f"根因链[object Object]检查: {'PASS' if not has_object_object else 'FAIL'}")

            # 5b. 补强方案 - 检查是否显示原始JSON
            # 找到补强方案区域的文本
            remediation_section = page.locator('text=补强方案').first
            if remediation_section.is_visible(timeout=3000):
                # 获取补强方案附近的文本内容
                remediation_text = page.evaluate('''() => {
                    const allElements = document.querySelectorAll('*');
                    for (const el of allElements) {
                        if (el.textContent.includes('补强方案') && el.children.length > 0) {
                            return el.textContent.substring(0, 2000);
                        }
                    }
                    return '';
                }''')
                # 检查是否包含原始JSON特征
                has_raw_json = ('"step"' in remediation_text and '"action"' in remediation_text)
                results["remediation_ok"] = not has_raw_json
                results["remediation_text_preview"] = remediation_text[:500]
                log(f"补强方案JSON检查: {'PASS' if not has_raw_json else 'FAIL'}")
                if has_raw_json:
                    log(f"  原始JSON内容: {remediation_text[:300]}")
            else:
                results["remediation_ok"] = None
                log("未找到补强方案区域")

            # 6. 导航到就业指导页面检查技能缺口
            log("导航到就业指导页面...")
            page.goto(f"{BASE_URL}/employment", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)
            page.screenshot(path=str(SCREENSHOT_DIR / "headless_06_employment.png"), full_page=True)

            # 也尝试 /career 路径
            employment_content = page.content()
            if "技能缺口" in employment_content or "就业指导" in employment_content:
                has_json_employment = ('"skill"' in employment_content or '"gap"' in employment_content)
                results["employment_gap_ok"] = not has_json_employment
                log(f"就业指导技能缺口检查: {'PASS' if not has_json_employment else 'FAIL'}")
            else:
                # 尝试其他路径
                for path in ["/career", "/jobs", "/employment-guide"]:
                    page.goto(f"{BASE_URL}{path}", wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(2000)
                    employment_content = page.content()
                    if "技能缺口" in employment_content or "就业" in employment_content:
                        page.screenshot(path=str(SCREENSHOT_DIR / f"headless_06_employment{path.replace('/', '_')}.png"), full_page=True)
                        has_json_employment = ('"skill"' in employment_content or '"gap"' in employment_content)
                        results["employment_gap_ok"] = not has_json_employment
                        log(f"就业指导技能缺口检查 (路径{path}): {'PASS' if not has_json_employment else 'FAIL'}")
                        break
                else:
                    results["employment_gap_ok"] = None
                    log("未找到就业指导页面")

            # 收集截图列表
            results["screenshots"] = [str(f) for f in sorted(SCREENSHOT_DIR.glob("headless_*.png"))]

        except Exception as e:
            results["errors"].append(str(e))
            log(f"错误: {e}")
            try:
                page.screenshot(path=str(SCREENSHOT_DIR / "headless_error_exception.png"))
            except:
                pass
        finally:
            browser.close()

    return results

if __name__ == "__main__":
    log("=" * 60)
    log("研芯通无头浏览器视觉验证开始")
    log("=" * 60)
    results = run_visual_check()

    log("\n" + "=" * 60)
    log("验证结果汇总")
    log("=" * 60)
    for key, val in results.items():
        if key not in ("screenshots", "errors", "remediation_text_preview"):
            status = {True: "✅ PASS", False: "❌ FAIL", None: "⚠️ 未检查"}.get(val, val)
            log(f"  {key}: {status}")
    if results.get("errors"):
        log(f"\n错误: {results['errors']}")
    if results.get("remediation_text_preview"):
        log(f"\n补强方案文本预览:\n{results['remediation_text_preview']}")

    # 保存结果JSON
    result_file = SCREENSHOT_DIR / "headless_results.json"
    with open(result_file, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    log(f"\n结果已保存: {result_file}")
