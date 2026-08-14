"""
从豆包浏览器提取飞书/Aily cookies - 支持锁定文件
"""
import sqlite3
import json
import base64
import ctypes
import ctypes.wintypes
import os
import tempfile
from pathlib import Path

def log(msg):
    print(f"[cookie] {msg}", flush=True)

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

def copy_locked_file(src, dst):
    """用 FileShare.ReadWrite 复制被锁定的文件"""
    import ctypes
    from ctypes import wintypes

    GENERIC_READ = 0x80000000
    FILE_SHARE_READ = 0x00000001
    FILE_SHARE_WRITE = 0x00000002
    FILE_SHARE_DELETE = 0x00000004
    OPEN_EXISTING = 3
    INVALID_HANDLE_VALUE = -1

    kernel32 = ctypes.windll.kernel32
    handle = kernel32.CreateFileW(
        str(src), GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None, OPEN_EXISTING, 0, None
    )
    if handle == INVALID_HANDLE_VALUE:
        raise OSError(f"Cannot open {src}: {ctypes.get_last_error()}")

    try:
        with open(dst, 'wb') as f:
            buf = ctypes.create_string_buffer(65536)
            bytes_read = wintypes.DWORD(0)
            while True:
                ok = kernel32.ReadFile(handle, buf, 65536, ctypes.byref(bytes_read), None)
                if not ok or bytes_read.value == 0:
                    break
                f.write(buf.raw[:bytes_read.value])
    finally:
        kernel32.CloseHandle(handle)

# 1. 读取主密钥
local_state_path = Path(r"C:\Users\Administrator\AppData\Local\Doubao\User Data\Local State")
with open(local_state_path, "r", encoding="utf-8") as f:
    local_state = json.load(f)

encrypted_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])
if encrypted_key[:5] == b"DPAPI":
    encrypted_key = encrypted_key[5:]
master_key = dpapi_decrypt(encrypted_key)
log(f"主密钥解密: {'成功' if master_key else '失败'}, 长度={len(master_key) if master_key else 0}")

# 2. 复制锁定的 Cookies 文件
cookies_src = Path(r"C:\Users\Administrator\AppData\Local\Doubao\User Data\Default\Network\Cookies")
cookies_tmp = Path(tempfile.gettempdir()) / "doubao_cookies_copy.db"
copy_locked_file(cookies_src, cookies_tmp)
log(f"已复制 Cookies 数据库 ({cookies_tmp.stat().st_size} bytes)")

# 3. 读取并解密
conn = sqlite3.connect(str(cookies_tmp))
cursor = conn.cursor()
cursor.execute("""
    SELECT host_key, name, path, encrypted_value, expires_utc, is_secure, is_httponly
    FROM cookies
    WHERE host_key LIKE '%feishu%' OR host_key LIKE '%larksuite%' OR host_key LIKE '%aily%'
    ORDER BY host_key, name
""")
rows = cursor.fetchall()
log(f"找到 {len(rows)} 个飞书/Aily cookies")

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

cookies = []
failed = 0
for host, name, path, enc_value, expires, secure, httponly in rows:
    if not enc_value:
        continue
    decrypted = None
    if master_key and len(enc_value) >= 15 and enc_value[:3] == b"v10":
        try:
            decrypted = AESGCM(master_key).decrypt(enc_value[3:15], enc_value[15:], None)
        except:
            pass
    if not decrypted:
        decrypted = dpapi_decrypt(enc_value)
    if decrypted:
        try:
            value = decrypted.decode("utf-8")
        except:
            value = decrypted.decode("latin-1")
        cookies.append({
            "host": host, "name": name, "path": path, "value": value,
            "secure": bool(secure), "httponly": bool(httponly)
        })
    else:
        failed += 1
        log(f"  解密失败: {host}/{name} (前缀={enc_value[:5]})")

conn.close()
os.remove(cookies_tmp)

log(f"\n成功解密 {len(cookies)} 个, 失败 {failed} 个")

# 保存
output = Path(r"C:\Users\Administrator\Desktop\yanxintong\feishu_cookies.json")
with open(output, "w", encoding="utf-8") as f:
    json.dump(cookies, f, ensure_ascii=False, indent=2)

# 打印关键cookie
for c in cookies:
    if any(k in c["name"].lower() for k in ["session", "token", "csrf", "passport", "did", "uid"]):
        log(f"关键: {c['host']} / {c['name']} = {c['value'][:80]}")

log(f"\n已保存到 {output}")
