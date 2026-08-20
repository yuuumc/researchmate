import base64 
d=open('w_r3v3.b64').read().replace('\r','').replace('\n','') 
data=base64.b64decode(d) 
open('src\components\WaferDome.vue','wb').write(data) 
print('decoded',len(data)) 
