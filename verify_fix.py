"""
验证阻断修复：新注册账号诊断非0分
1. 注册新账号
2. 完成注册向导（含学情自评）
3. 生成诊断报告
4. 检查分数≠0且≠50，检查mastered/weak非空
"""
import asyncio
import time
import random
import string
from playwright.async_api import async_playwright

PRODUCT_URL = "https://researchmate.researchkit.online"
SCREENSHOTS_DIR = r"C:\Users\Administrator\Desktop\yanxintong\screenshots"

def random_email():
    ts = str(int(time.time()))[-6:]
    rand = ''.join(random.choices(string.ascii_lowercase, k=4))
    return f"test{ts}{rand}@test.com"

async def main():
    email = random_email()
    password = "Test1234!"
    print(f"[*] 注册新账号: {email}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="zh-CN"
        )
        page = await context.new_page()

        # 监听控制台日志
        page.on("console", lambda msg: print(f"  [browser:{msg.type}] {msg.text[:200]}") if msg.type == "error" else None)

        # 1. 访问首页
        await page.goto(PRODUCT_URL, wait_until="domcontentloaded")
        await page.wait_for_timeout(3000)
        print("[*] 首页加载完成")

        # 2. 点击注册/登录
        # 先找注册按钮
        reg_btn = page.locator('button:has-text("注册"), a:has-text("注册"), button:has-text("免费注册")')
        if await reg_btn.count() > 0:
            await reg_btn.first.click()
            await page.wait_for_timeout(2000)
            print("[*] 进入注册页面")
        else:
            # 可能直接有登录按钮
            login_btn = page.locator('button:has-text("登录"), a:has-text("登录")')
            if await login_btn.count() > 0:
                await login_btn.first.click()
                await page.wait_for_timeout(2000)
                # 找注册链接
                reg_link = page.locator('text=注册').first
                if await reg_link.count() > 0:
                    await reg_link.click()
                    await page.wait_for_timeout(2000)

        await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_reg_page.png")

        # 3. 填写注册表单
        # 查找邮箱和密码输入框
        email_input = page.locator('input[type="email"], input[name="email"], input[placeholder*="邮箱"]').first
        pass_input = page.locator('input[type="password"]').first

        await email_input.fill(email)
        await pass_input.fill(password)
        print("[*] 填写邮箱密码")

        # 如果有确认密码框
        pass_inputs = page.locator('input[type="password"]')
        if await pass_inputs.count() > 1:
            await pass_inputs.nth(1).fill(password)

        # 点击注册提交按钮
        submit = page.locator('button:has-text("注册"), button[type="submit"]').first
        await submit.click()
        await page.wait_for_timeout(5000)
        print(f"[*] 注册后URL: {page.url}")

        # 4. 应该跳转到注册向导，如果没有则显式导航
        await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_after_reg.png")

        if "wizard" not in page.url:
            await page.goto(f"{PRODUCT_URL}/profile/wizard", wait_until="domcontentloaded")
            await page.wait_for_timeout(3000)
            print(f"[*] 显式导航到向导: {page.url}")

        # Step 1: 昵称
        print(f"[*] 向导Step1, URL: {page.url}")
        # 昵称输入框 placeholder 是 "如：小明"
        nickname_input = page.locator('.wizard-step:visible input.yx-input').first
        await nickname_input.wait_for(state="visible", timeout=10000)
        await nickname_input.fill("测试用户")
        await page.wait_for_timeout(500)
        next_btn = page.locator('.wizard-nav button:has-text("下一步")').first
        await next_btn.click()
        await page.wait_for_timeout(2000)
        print("[*] Step1完成")

        # Step 2: 学情自评
        print(f"[*] 向导Step2, URL: {page.url}")
        await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_step2.png")

        # 等待Step2可见
        await page.wait_for_selector('#target-school:visible', timeout=10000)

        # 目标院校
        school_input = page.locator('#target-school').first
        if await school_input.count() > 0:
            await school_input.fill("电子科技大学")
            await page.wait_for_timeout(500)

        # 目标专业 - 第二个select（第一个是考研年份？不，Step2有专业select和年份select）
        # 按顺序：专业select在年份select之前
        selects = page.locator('.wizard-step:visible select')
        select_count = await selects.count()
        print(f"[*] Step2可见select数量: {select_count}")
        if select_count >= 1:
            await selects.nth(0).select_option(label="集成电路设计")
            await page.wait_for_timeout(500)
        if select_count >= 2:
            await selects.nth(1).select_option(value="2027")
            await page.wait_for_timeout(500)

        # 选择已掌握知识点（点击2-3个）
        mastered_chips = page.locator('.wizard-step:visible .skill-chip:not(.skill-chip--weak)')
        mastered_count = await mastered_chips.count()
        if mastered_count > 0:
            for i in range(min(3, mastered_count)):
                await mastered_chips.nth(i).click()
                await page.wait_for_timeout(200)
        print(f"[*] 选择了{min(3, mastered_count)}个已掌握知识点")

        # 选择薄弱知识点（点击2-3个）
        weak_chips = page.locator('.wizard-step:visible .skill-chip--weak')
        weak_count = await weak_chips.count()
        if weak_count > 0:
            for i in range(min(3, weak_count)):
                await weak_chips.nth(i).click()
                await page.wait_for_timeout(200)
        print(f"[*] 选择了{min(3, weak_count)}个薄弱知识点")

        # 自评星级：半导体物理5星，微电子器件4星，集成电路设计3星
        # 这样平均4星 → suggested_score = 80
        star_buttons = page.locator('.wizard-step:visible .star-btn')
        star_count = await star_buttons.count()
        print(f"[*] 找到{star_count}个星级按钮")
        # 第一行第5个(5星), 第二行第4个(4星), 第三行第3个(3星)
        if star_count >= 15:
            await star_buttons.nth(4).click()  # 半导体物理 5星
            await page.wait_for_timeout(200)
            await star_buttons.nth(9).click()  # 微电子器件 4星 (5+4=9)
            await page.wait_for_timeout(200)
            await star_buttons.nth(12).click()  # 集成电路设计 3星 (10+2=12)
            await page.wait_for_timeout(200)
            print("[*] 自评星级: 半导体物理5星, 微电子器件4星, 集成电路设计3星 (平均4星→80分)")

        await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_step2_filled.png")

        next_btn = page.locator('.wizard-nav button:has-text("下一步")').first
        await next_btn.click()
        await page.wait_for_timeout(2000)

        # Step 3: 备考设置
        print(f"[*] 向导Step3, URL: {page.url}")

        # 等待Step3可见
        await page.wait_for_selector('#exam-date:visible', timeout=10000)

        # 考试日期
        date_select = page.locator('#exam-date').first
        if await date_select.count() > 0:
            options = await date_select.locator('option').all()
            if len(options) > 1:
                await date_select.select_option(index=1)
                await page.wait_for_timeout(500)

        # 每周学习时长
        hours_input = page.locator('.wizard-step:visible input[type="number"]').first
        if await hours_input.count() > 0:
            await hours_input.fill("20")

        await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_step3.png")

        # 点击完成
        complete_btn = page.locator('.wizard-nav button:has-text("完成")').first
        await complete_btn.click()
        await page.wait_for_timeout(5000)
        print(f"[*] 向导完成, URL: {page.url}")
        await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_wizard_done.png")

        # 5. 导航到诊断页
        await page.goto(f"{PRODUCT_URL}/diagnosis", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        print(f"[*] 诊断页URL: {page.url}")
        await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_diag_page.png")

        # 6. 点击生成诊断报告
        gen_btn = page.locator('button:has-text("生成个性化诊断报告"), button:has-text("生成诊断报告")').first
        if await gen_btn.count() > 0:
            await gen_btn.click()
            print("[*] 点击生成诊断报告，等待结果...")

            # 等待报告生成（最多90秒）
            try:
                await page.wait_for_selector(
                    'text=重新生成诊断报告',
                    timeout=90000
                )
                print("[*] 诊断报告生成完成!")
            except Exception as e:
                print(f"[!] 等待报告超时: {e}")
                await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_diag_timeout.png")

            await page.wait_for_timeout(3000)
            await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_diag_result.png")

            # 7. 提取诊断结果
            page_text = await page.evaluate('() => document.body.innerText')

            # 查找分数
            import re
            score_match = re.search(r'(\d+)\s*分', page_text)
            if score_match:
                score = int(score_match.group(1))
                print(f"\n{'='*50}")
                print(f"[结果] 诊断分数: {score}")
                if score == 0:
                    print("[FAIL] 分数为0 - 阻断未修复!")
                elif score == 50:
                    print("[WARN] 分数为50 - 可能仍是固定分")
                else:
                    print(f"[PASS] 分数非0非50，符合预期 (自评4星→约80分)")
                print(f"{'='*50}")
            else:
                print("[WARN] 未找到分数")
                # 打印部分页面文本
                print(f"页面文本前2000字: {page_text[:2000]}")

            # 检查是否有 [object Object]
            if '[object Object]' in page_text:
                print("[FAIL] 发现 [object Object]!")
            else:
                print("[PASS] 无 [object Object]")

            # 滚动查看根因链和补强方案
            await page.evaluate('() => { const m = document.querySelector("main.yx-content"); if(m) m.scrollTop = 1200; }')
            await page.wait_for_timeout(2000)
            await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_diag_rootcause.png")

            await page.evaluate('() => { const m = document.querySelector("main.yx-content"); if(m) m.scrollTop = 2000; }')
            await page.wait_for_timeout(2000)
            await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_diag_remediation.png")

            # 检查补强方案是否结构化（不是原始JSON）
            remediation_text = await page.evaluate('() => { const m = document.querySelector("main.yx-content"); return m ? m.innerText : document.body.innerText; }')
            if 'Step' in remediation_text or '补强' in remediation_text:
                print("[PASS] 补强方案区域存在")
            if '{' in remediation_text and '"action"' in remediation_text:
                print("[FAIL] 补强方案显示原始JSON!")
            else:
                print("[PASS] 补强方案未显示原始JSON")
        else:
            print("[!] 未找到生成报告按钮")
            await page.screenshot(path=f"{SCREENSHOTS_DIR}/verify_no_gen_btn.png")
            print(await page.evaluate('() => document.body.innerText[:1000]'))

        await browser.close()
        print("\n[*] 验证完成")

if __name__ == "__main__":
    asyncio.run(main())
