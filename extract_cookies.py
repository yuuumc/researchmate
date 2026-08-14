"""
从豆包浏览器提取飞书/Aily cookies，供 Playwright 使用
"""
import sqlite3
import json
import base64
import ctypes
import ctypes.wintypes
import shutil
import os
import tempfile
from pathlib import Path

def log(msg):
    print(f"[cookie] {msg}", flush=True)

# Windows DPAPI
class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

def dpapi_decrypt(data):
    blob_in = DATA_BLOB(len(data), ctypes.cast(ctypes.c_char_p(data), ctypes.POINTER(ctypes.c_char)))
    blob_out = DATA_BLOB()
    if ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)
    ):
        plaintext = ctypes.string_at(blob_out.pbData, blob_out.cbData)
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)
        return plaintext
    return None

# 1. 读取 Local State 中的加密密钥
local_state_path = Path(r"C:\Users\Administrator\AppData\Local\Doubao\User Data\Local State")
with open(local_state_path, "r", encoding="utf-8") as f:
    local_state = json.load(f)

encrypted_key_b64 = local_state["os_crypt"]["encrypted_key"]
encrypted_key = base64.b64decode(encrypted_key_b64)

# 去掉 "DPAPI" 前缀
if encrypted_key[:5] == b"DPAPI":
    encrypted_key = encrypted_key[5:]

log(f"加密密钥长度: {len(encrypted_key)}")

# 用 DPAPI 解密
master_key = dpapi_decrypt(encrypted_key)
if master_key:
    log(f"主密钥解密成功，长度: {len(master_key)}")
else:
    log("主密钥解密失败（可能使用 App-Bound Encryption）")
    # 尝试直接用 DPAPI 解密 cookie 值（旧版方式）
    master_key = None

# 2. 复制 Cookies 数据库（避免锁定）
cookies_src = Path(r"C:\Users\Administrator\AppData\Local\Doubao\User Data\Default\Network\Cookies")
cookies_tmp = Path(tempfile.gettempdir()) / "doubao_cookies_copy"
shutil.copy2(cookies_src, cookies_tmp)
log(f"已复制 Cookies 数据库到 {cookies_tmp}")

# 3. 读取 cookies
conn = sqlite3.connect(str(cookies_tmp))
cursor = conn.cursor()

# 查看表结构
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
log(f"数据库表: {tables}")

# 查询飞书相关 cookies
cursor.execute("""
    SELECT host_key, name, path, encrypted_value, expires_utc, is_secure, is_httponly
    FROM cookies
    WHERE host_key LIKE '%feishu%' OR host_key LIKE '%larksuite%' OR host_key LIKE '%aily%'
    ORDER BY host_key, name
""")
rows = cursor.fetchall()
log(f"找到 {len(rows)} 个飞书/Aily相关 cookies")

# 4. 解密 cookies
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

cookies = []
for host, name, path, enc_value, expires, secure, httponly in rows:
    if not enc_value:
        continue

    decrypted = None

    # 尝试 AES-256-GCM (v80+ 方式)
    if master_key and len(enc_value) >= 3 and enc_value[:3] == b"v10":
        try:
            nonce = enc_value[3:15]
            ciphertext = enc_value[15:-16]
            tag = enc_value[-16:]
            aesgcm = AESGCM(master_key)
            decrypted = aesgcm.decrypt(nonce, enc_value[15:], None)
        except Exception as e:
            log(f"  AES解密失败 {host}/{name}: {e}")

    # 尝试直接 DPAPI 解密（旧版方式）
    if not decrypted:
        try:
            decrypted = dpapi_decrypt(enc_value)
        except:
            pass

    if decrypted:
        try:
            value = decrypted.decode("utf-8")
        except:
            value = decrypted.decode("latin-1")
        cookies.append({
            "host": host,
            "name": name,
            "path": path,
            "value": value,
            "expires": expires,
            "secure": bool(secure),
            "httponly": bool(httponly)
        })
        log(f"  ✓ {host} / {name} = {value[:50]}...")
    else:
        log(f"  ✗ {host} / {name} 解密失败 (enc_value长度={len(enc_value)}, 前缀={enc_value[:10]})")

conn.close()
os.remove(cookies_tmp)

# 5. 保存 cookies 供 Playwright 使用
output = Path(r"C:\Users\Administrator\Desktop\yanxintong\feishu_cookies.json")
with open(output, "w", encoding="utf-8") as f:
    json.dump(cookies, f, ensure_ascii=False, indent=2)
log(f"\n已保存 {len(cookies)} 个 cookies 到 {output}")

# 打印关键 cookie
for c in cookies:
    if c["name"] in ("session", "session_list", "sl_session", "access_token", "refresh_token", "lark_oapi_csrf_token", "passport_web_did"):
        log(f"关键cookie: {c['name']} = {c['value'][:80]}...")
