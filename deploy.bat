@echo off
cd /d C:\Users\Administrator\Desktop\yanxintong
vercel --prod --yes <nul > C:\Users\Administrator\Desktop\yanxintong\vercel-deploy.log 2>&1
echo DEPLOY_EXIT=%ERRORLEVEL% >> C:\Users\Administrator\Desktop\yanxintong\vercel-deploy.log
