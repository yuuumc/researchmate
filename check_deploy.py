import urllib.request

chunk_url = 'https://researchmate.researchkit.online/assets/diagnosisInput-DXSnILni.js'
req = urllib.request.Request(chunk_url, headers={'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache'})
resp = urllib.request.urlopen(req, timeout=10)
js = resp.read().decode('utf-8')
print(f'Chunk size: {len(js)} chars')
print(f'Content: {js[:2000]}')
print()
if 'suggested_score' in js:
    print('CONFIRMED: suggested_score found!')
if 'self_assessment' in js:
    print('CONFIRMED: self_assessment fallback found!')
if 'mastered_skills' in js:
    print('CONFIRMED: mastered_skills fallback found!')
