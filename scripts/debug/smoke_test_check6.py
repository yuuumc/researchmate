import urllib.request
import json
import time

BASE = 'https://researchmate.researchkit.online'
ORIGIN = 'https://researchmate.researchkit.online'

def post_chat(mode, prompt, timeout=60):
    body = json.dumps({'mode': mode, 'prompt': prompt, 'userInput': prompt}).encode('utf-8')
    req = urllib.request.Request(
        f'{BASE}/api/chat',
        data=body,
        headers={'Origin': ORIGIN, 'Content-Type': 'application/json'},
        method='POST'
    )
    start = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = resp.read().decode('utf-8')
        elapsed = time.time() - start
        return resp.status, len(data), elapsed

print('=== 重试检查6: 高频切换5次（超时60s，间隔2s）===')
test_modes = ['diagnosis', 'mentor', 'planning', 'diagnosis', 'mentor']
test_prompts = ['诊断测试A', '导师测试A', '规划测试A', '诊断测试B', '导师测试B']
all_pass = True
times = []
for i, (m, p) in enumerate(zip(test_modes, test_prompts)):
    try:
        status, length, elapsed = post_chat(m, p, timeout=60)
        times.append(f'{elapsed:.1f}')
        ok = status == 200 and elapsed < 60
        if not ok:
            all_pass = False
        tag = 'PASS' if ok else 'FAIL'
        print(f'  第{i+1}次 ({m}): {status}, {elapsed:.1f}s, 长度={length} {tag}')
    except Exception as e:
        all_pass = False
        times.append('TIMEOUT')
        print(f'  第{i+1}次 ({m}): FAIL - {e}')
    if i < 4:
        time.sleep(2)

print()
result = 'PASS' if all_pass else 'FAIL'
print(f'结果: {result}')
print(f"耗时: {', '.join(times)}s")
