# Upload Worker 운영 문서 (간단)

## 개요
`storage/videos` 내 파일을 순차 업로드하며, 실패해도 전체 프로세스는 계속 진행됩니다.
상태는 디렉토리 이동으로만 관리합니다.

## 디렉토리 구조
- `storage/videos/processed` : 업로드 대기
- `storage/videos/uploading` : 업로드 진행 중
- `storage/videos/done` : 업로드 성공
- `storage/videos/failed` : 재시도 실패

## 실행 (수동)
```bash
npm i -D tsx
npx tsx scripts/run-upload-worker.ts
```

## 재처리 (failed -> processed)
```bash
npx tsx scripts/retry-failed.ts
```

## 로그
- 로그 파일은 날짜별로 저장됩니다.
- 경로: `storage/logs/upload-worker-YYYY-MM-DD.log`

## 스케줄러 예시
### Windows 작업 스케줄러
- Program: `cmd`
- Arguments:
  ```
  /c cd /d D:\ai\SHOT_LO_PRO\marketing && npx tsx scripts\run-upload-worker.ts
  ```

### Linux cron
```
*/5 * * * * cd /path/to/marketing && npx tsx scripts/run-upload-worker.ts
```
