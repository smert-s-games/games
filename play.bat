@echo off
cd /d "%~dp0"
py -3 platform\build.py garden-merge || exit /b 1
py -3 platform\serve.py garden-merge
