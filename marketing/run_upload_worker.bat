@echo off
setlocal
cd /d "%~dp0"

set LOGFILE=%CD%\storage\logs\scheduler.log
echo [%date% %time%] RUN_UPLOAD_WORKER_START>> "%LOGFILE%"
call npx tsx scripts\run-upload-worker.ts >> "%LOGFILE%" 2>&1
echo [%date% %time%] RUN_UPLOAD_WORKER_END>> "%LOGFILE%"

endlocal
