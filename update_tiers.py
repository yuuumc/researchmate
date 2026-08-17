"""
更新三档账号的 ability_stars，使三档分数有明显梯度
- 学霸：多4-5星 → suggested_score ~80
- 中等：多3星 → suggested_score ~57
- 差生：多1-2星 → suggested_score ~33
然后验证诊断分数
"""
import json
import re
import time
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright

BASE_URL = "https://researchmate.researchkit.online"
SCREENSHOT_DIR = Path(r"C:\Users\Administrator\Desktop\yanxintong\screenshots")

# 三档账号的目标 ability_stars（使用真实的考纲知识点）
# 学霸：10个4星 + 3个3星 + 2个5星 = avg 3.93 → 79
XUEBA_STARS = {
    "振荡器": 4, "MOSFET I-V": 5, "光学性质": 4, "单级放大器": 4,
    "晶格振动与声子": 3, "MOS 结构与 C-V 特性": 5, "电流镜与有源负载": 4,
    "超导基础：BCS 理论": 3, "CMOS 反相器静态特性": 4, "时钟树综合与复位策略": 4,
    "BJT 电流增益与频率特性": 4, "PN结的能带图与内建电场": 4, "载流子输运：漂移与扩散": 5,
    "功率器件：IGBT 与功率 MOSFET": 4, "晶体学基础：晶格与倒格矢": 3,
}

# 中等：2个4星 + 6个3星 + 4个2星 = avg 2.83 → 57
ZHONGDENG_STARS = {
    "MOSFET I-V": 4, "光学性质": 2, "单级放大器": 3, "超导基础：BCS 理论": 2,
    "CMOS 反相器静态特性": 2, "基准源：Bandgap 与 LDO": 3, "PN结的能带图与内建电场": 4,
    "晶体学基础：晶格与倒格矢": 2, "运算放大器：两级与套筒式": 3,
    "CMOS 时序逻辑电路：锁存器与触发器": 3, "BJT 电流增益与频率特性": 3,
    "载流子输运：漂移与扩散": 3,
}

# 差生：2个3星 + 4个2星 + 6个1星 = avg 1.67 → 33
CHASHENG_STARS = {
    "振荡器": 1, "MOSFET I-V": 3, "光学性质": 2, "单级放大器": 2,
    "低功耗设计技术": 1, "近自由电子近似": 1, "MOS 结构与 C-V 特性": 3,
    "超导基础：BCS 理论": 1, "CMOS 反相器静态特性": 2, "器件可靠性与失效机制": 1,
    "PN结的能带图与内建电势": 2, "MOSFET 高频模型与频率特性": 1,
    "晶体学基础：晶格与倒格矢": 1, "固体磁性：顺磁/铁磁/反铁磁": 1,
}

ACCOUNTS = [
    {"name": "学霸", "email": "xueba@yanxintong-test.com", "password": "Test1234!",
     "stars": XUEBA_STARS, "expected": "75-90"},
    {"name": "中等", "email": "zhongdeng@yanxintong-test.com", "password": "Test1234!",
     "stars": ZHONGDENG_STARS, "expected": "45-65"},
    {"name": "差生", "email": "chasheng@yanxintong-test.com", "password": "Test1234!",
     "stars": CHASHENG_STARS, "expected": "25-45"},
]

def update_and_test(p, account):
    print(f"\n{'='*60}")
    print(f"处理 {account['name']} ({account['email']})，预期 {account['expected']}")
    print(f"{'='*60}")

    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1920, "height": 1080}, locale="zh-CN")
    page = context.new_page()

    result = {"account": account["name"], "expected": account["expected"]}

    try:
        # 1. 登录
        print("  登录中...")
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(3000)

        email_input = page.locator('input[type="email"]').first
        if email_input.is_visible(timeout=5000):
            email_input.fill(account["email"])
            page.locator('input[type="password"]').first.fill(account["password"])
            page.locator('button:has-text("登录"), button[type="submit"]').first.click()
            page.wait_for_timeout(8000)

        # 2. 通过 Supabase 客户端更新 ability_stars
        print("  更新 ability_stars...")
        stars_json = json.dumps(account["stars"], ensure_ascii=False)

        # 计算 weak_topics（1-2星的）和 mastered_topics（4-5星的）
        weak = [k for k, v in account["stars"].items() if v <= 2]
        mastered = [k for k, v in account["stars"].items() if v >= 4]
        weak_json = json.dumps(weak, ensure_ascii=False)
        mastered_json = json.dumps(mastered, ensure_ascii=False)

        update_result = page.evaluate("""async (params) => {
            const { stars, weak, mastered } = params;
            const supabaseUrl = 'https://rgvceoumsmxacswobfcp.supabase.co';
            const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJndmNlb3Vtc214YWNzd29iZmNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMzQwNzMsImV4cCI6MjEwMDgxMDA3M30.lHQDAJWkHZEUxyfTFdi6-tWZj8Ja0pG65INDDx8DWEE';

            const tokenData = JSON.parse(localStorage.getItem('researchmate.auth.token') || '{}');
            const token = tokenData.access_token;
            if (!token) return { error: 'No auth token' };

            // base64url 解码 JWT
            function decodeJwt(t) {
                const parts = t.split('.');
                let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
                while (payload.length % 4) payload += '=';
                return JSON.parse(decodeURIComponent(escape(atob(payload))));
            }
            const payload = decodeJwt(token);
            const userId = payload.sub;

            // 查 profile（RLS 只返回自己的）
            const profileResp = await fetch(supabaseUrl + '/rest/v1/profiles?select=*', {
                headers: { 'Authorization': 'Bearer ' + token, 'apikey': anonKey }
            });
            const profiles = await profileResp.json();

            if (!profiles || profiles.length === 0) {
                return { error: 'No profile found', userId };
            }

            const profile = profiles[0];

            // 用 user_id 更新（profiles 表主键是 user_id）
            const updateResp = await fetch(supabaseUrl + '/rest/v1/profiles?user_id=eq.' + userId, {
                method: 'PATCH',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'apikey': anonKey,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    ability_stars: stars,
                    weak_topics: weak,
                    mastered_topics: mastered,
                    weak_points: weak,
                    mastered_skills: mastered,
                    updated_at: new Date().toISOString()
                })
            });

            const updateText = await updateResp.text();
            return {
                success: updateResp.ok,
                status: updateResp.status,
                userId: userId,
                profileKeys: Object.keys(profile),
                starCount: Object.keys(stars).length,
                weakCount: weak.length,
                masteredCount: mastered.length,
                response: updateText.substring(0, 500)
            };
        }""", {"stars": account["stars"], "weak": weak, "mastered": mastered})

        print(f"  更新结果: {update_result.get('success')}")
        result["update"] = update_result

        if not update_result.get("success"):
            print(f"  ⚠️ 更新可能失败，继续测试...")

        # 3. 直接更新 localStorage 中的 profile，然后刷新页面
        print("  更新本地缓存并刷新...")
        page.evaluate("""(params) => {
            const { stars, weak, mastered } = params;
            const raw = localStorage.getItem('researchmate_profile');
            if (raw) {
                const p = JSON.parse(raw);
                p.ability_stars = stars;
                p.weak_topics = weak;
                p.mastered_topics = mastered;
                p.weak_points = weak;
                p.mastered_skills = mastered;
                p.updated_at = new Date().toISOString();
                localStorage.setItem('researchmate_profile', JSON.stringify(p));
            }
        }""", {"stars": account["stars"], "weak": weak, "mastered": mastered})

        # 刷新页面让新数据生效
        page.goto(f"{BASE_URL}/diagnosis", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(8000)

        # 4. 检查 suggested_score
        input_data = page.evaluate("""() => {
            try {
                const raw = localStorage.getItem('researchmate_profile');
                if (raw) {
                    const p = JSON.parse(raw);
                    const stars = p.ability_stars || {};
                    const values = Object.values(stars);
                    if (values.length > 0) {
                        const avg = values.reduce((a,b) => a+b, 0) / values.length;
                        return {
                            starCount: values.length,
                            avgStar: avg.toFixed(2),
                            suggestedScore: Math.round((avg / 5) * 100),
                            stars: stars
                        };
                    }
                }
            } catch(e) {}
            return null;
        }""")
        print(f"  Profile: {json.dumps(input_data, ensure_ascii=False)[:500]}")
        result["profile"] = input_data

        # 5. 拦截 /api/agent 请求
        captured_input = None
        def handle_request(request):
            nonlocal captured_input
            if "/api/agent" in request.url and request.method == "POST":
                try:
                    post_data = request.post_data
                    if post_data:
                        captured_input = json.loads(post_data)
                except:
                    pass
        page.on("request", handle_request)

        # 6. 生成诊断 - 先滚动到按钮位置
        print("  查找生成按钮...")
        # 列出页面上所有按钮
        buttons = page.locator('button').all()
        btn_texts = []
        for b in buttons[:20]:
            try:
                t = b.inner_text().strip()
                if t:
                    btn_texts.append(t[:30])
            except:
                pass
        print(f"  页面按钮: {btn_texts}")

        # 尝试多种选择器
        gen_btn = None
        for selector in [
            'button:has-text("生成个性化诊断报告")',
            'button:has-text("重新生成诊断报告")',
            'button:has-text("生成诊断")',
            'button:has-text("重新生成")',
        ]:
            btn = page.locator(selector).first
            if btn.is_visible(timeout=2000):
                gen_btn = btn
                print(f"  找到按钮: {selector}")
                break

        if gen_btn:
            # 滚动到按钮
            gen_btn.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)
            print("  点击生成诊断报告...")
            gen_btn.click()
            try:
                page.wait_for_selector('text=重新生成诊断报告', timeout=120000)
                page.wait_for_timeout(5000)
                print("  诊断生成完成")
            except:
                print("  等待超时，检查页面...")
                page.wait_for_timeout(5000)
        else:
            print("  未找到生成按钮，尝试直接调用 API...")
            # 直接通过页面 JS 调用诊断
            page.screenshot(path=str(SCREENSHOT_DIR / f"tier2_{account['name']}_nobtn.png"))

        if captured_input:
            suggested = captured_input.get("input", {}).get("suggested_score")
            print(f"  发送的 suggested_score: {suggested}")
            result["sent_suggested_score"] = suggested

        # 7. 提取分数
        page_text = page.evaluate("() => document.body.innerText")
        score = None
        m = re.search(r'诊断分数[：:]\s*(\d{1,3})', page_text)
        if m:
            score = int(m.group(1))
        if score is None:
            m = re.search(r'(\d{1,3})\s*分', page_text)
            if m:
                score = int(m.group(1))

        result["score"] = score
        print(f"  >>> 诊断分数: {score}")

        # 8. 截图
        screenshot_path = SCREENSHOT_DIR / f"tier2_{account['name']}.png"
        page.screenshot(path=str(screenshot_path), full_page=False)
        result["screenshot"] = str(screenshot_path)

    except Exception as e:
        result["error"] = str(e)
        print(f"  ❌ 错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        context.close()
        browser.close()

    return result

def main():
    print(f"三档账号 ability_stars 更新+验证 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    results = []
    with sync_playwright() as p:
        for account in ACCOUNTS:
            result = update_and_test(p, account)
            results.append(result)
            time.sleep(3)

    # 汇总
    print(f"\n{'='*70}")
    print("最终结果")
    print(f"{'='*70}")
    print(f"{'账号':<8} {'预期':<10} {'suggested':<12} {'实际分数':<10} {'状态'}")
    print("-" * 70)

    scores = {}
    for r in results:
        name = r["account"]
        expected = r["expected"]
        suggested = r.get("sent_suggested_score", r.get("profile", {}).get("suggestedScore", "?"))
        score = r.get("score", "?")
        scores[name] = score

        try:
            lo, hi = map(int, expected.split("-"))
            ok = lo <= score <= hi
            status = "✅" if ok else "❌"
        except:
            status = "?"

        print(f"{name:<8} {expected:<10} {str(suggested):<12} {str(score):<10} {status}")

    if all(isinstance(v, int) for v in scores.values()):
        x, z, c = scores.get("学霸", 0), scores.get("中等", 0), scores.get("差生", 0)
        print(f"\n梯度: 学霸{x} > 中等{z} > 差生{c}")
        print(f"  学霸-中等: {x-z} {'✅' if x-z >= 15 else '❌'}")
        print(f"  中等-差生: {z-c} {'✅' if z-c >= 15 else '❌'}")
        ok = x > z > c and (x-z) >= 15 and (z-c) >= 15
        print(f"  三档梯度: {'✅ 通过' if ok else '❌ 失败'}")

    with open(Path(r"C:\Users\Administrator\Desktop\yanxintong\tier_test_results2.json"), "w", encoding="utf-8") as f:
        json.dump({"test_time": datetime.now().isoformat(), "results": results}, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
