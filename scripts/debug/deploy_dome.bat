@echo off
cd /d C:\Users\Administrator\Desktop\yanxintong
call vercel --prod --yes > %TEMP%\vp_out.log 2> %TEMP%\vp_err.log
