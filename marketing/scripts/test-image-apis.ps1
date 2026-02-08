# 이미지 기능 테스트 스크립트
$baseUrl = "http://localhost:3000"

Write-Host "=== 이미지 기능 테스트 시작 ===" -ForegroundColor Cyan

# 1. 카테고리 이미지 테스트
Write-Host "`n1. 카테고리 이미지 로드 테스트" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/ads/config" -Method GET
    if ($response.ok -and $response.data.defaultCategoryImages) {
        $count = $response.data.defaultCategoryImages.Count
        Write-Host "  성공: $count 개의 카테고리 이미지 로드됨" -ForegroundColor Green
        Write-Host "  카테고리: $($response.data.defaultCategoryImages[0].category)"
    } else {
        Write-Host "  실패: 데이터 없음" -ForegroundColor Red
    }
} catch {
    Write-Host "  실패: $($_.Exception.Message)" -ForegroundColor Red
}

# 2. 썸네일 자동 테스트
Write-Host "`n2. 썸네일 자동 테스트" -ForegroundColor Yellow
$thumbnailBody = @{
    url = "https://www.coupang.com/vp/products/9327700120"
} | ConvertTo-Json -Compress

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/ads/thumbnail" -Method POST -Body $thumbnailBody -ContentType "application/json"
    if ($response.ok -and $response.imageUrl) {
        Write-Host "  성공: $($response.imageUrl)" -ForegroundColor Green
    } else {
        Write-Host "  실패: $($response.error)" -ForegroundColor Red
    }
} catch {
    $errorMsg = $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            $errorMsg = $errorJson.error
        } catch { }
    }
    Write-Host "  실패: $errorMsg" -ForegroundColor Red
}

# 3. AI 이미지 생성 테스트
Write-Host "`n3. AI 이미지 생성 테스트" -ForegroundColor Yellow
$aiBody = @{
    productId = "test-product-$(Get-Date -Format 'yyyyMMddHHmmss')"
    prompt = "fitness product, clean studio photo, high quality"
} | ConvertTo-Json -Compress

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/admin/ads/image-gen" -Method POST -Body $aiBody -ContentType "application/json"
    if ($response.ok -and $response.imageUrl) {
        Write-Host "  성공: $($response.imageUrl)" -ForegroundColor Green
        if (Test-Path "public$($response.imageUrl)") {
            $fileSize = (Get-Item "public$($response.imageUrl)").Length
            Write-Host "  파일 크기: $fileSize bytes" -ForegroundColor Gray
        }
    } else {
        Write-Host "  실패: $($response.error)" -ForegroundColor Red
    }
} catch {
    $errorMsg = $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            $errorMsg = $errorJson.error
        } catch { }
    }
    Write-Host "  실패: $errorMsg" -ForegroundColor Red
}

Write-Host "`n=== 테스트 완료 ===" -ForegroundColor Cyan
