"use client";

import { useMemo, useState } from "react";

type AccountStatus = "CONNECTED" | "DISCONNECTED" | "ERROR";
type Mode = "PRODUCTION" | "DRY_RUN";

type AccountState = {
  youtube: AccountStatus;
  tiktok: AccountStatus;
  instagram: AccountStatus;
};

export default function AdminLabSettings() {
  const [accounts, setAccounts] = useState<AccountState>({
    youtube: "CONNECTED",
    tiktok: "DISCONNECTED",
    instagram: "DISCONNECTED"
  });
  const [dailyLimit, setDailyLimit] = useState(20);
  const [platformAllowed, setPlatformAllowed] = useState({
    youtube: true,
    tiktok: false,
    instagram: false
  });
  const [mode, setMode] = useState<Mode>("DRY_RUN");
  const [toast, setToast] = useState("");

  const hasDisconnected = useMemo(
    () =>
      Object.values(accounts).some(
        (status) => status === "DISCONNECTED" || status === "ERROR"
      ),
    [accounts]
  );

  const handleCheckStatus = () => {
    setToast("연결 상태 재확인 완료");
  };

  const handleSave = () => {
    setToast("설정이 저장되었습니다");
  };

  return (
    <section className="lab-section">
      <div className="lab-page-header">
        <div>
          <h2>설정</h2>
          <p>운영에 필요한 최소 설정만 관리합니다.</p>
        </div>
      </div>

      {toast ? <div className="lab-helper">{toast}</div> : null}

      <div className="lab-settings-grid">
        <section className="lab-settings-card">
          <div className="lab-settings-head">
            <div>
              <h3>계정 연결 상태</h3>
              <p>계정별 토큰 유효성을 확인합니다.</p>
            </div>
            <button className="btn small" onClick={handleCheckStatus}>
              연결 상태 확인
            </button>
          </div>
          <div className="lab-settings-list">
            <div className="lab-settings-item">
              <span>YouTube</span>
              <span className={`lab-status-tag ${accounts.youtube.toLowerCase()}`}>
                {accounts.youtube}
              </span>
            </div>
            <div className="lab-settings-item">
              <span>TikTok</span>
              <span className={`lab-status-tag ${accounts.tiktok.toLowerCase()}`}>
                {accounts.tiktok}
              </span>
            </div>
            <div className="lab-settings-item">
              <span>Instagram</span>
              <span className={`lab-status-tag ${accounts.instagram.toLowerCase()}`}>
                {accounts.instagram}
              </span>
            </div>
          </div>
          {hasDisconnected ? (
            <div className="lab-helper warning">
              계정 미연결 상태에서는 업로드 실행이 비활성화됩니다.
            </div>
          ) : null}
        </section>

        <section className="lab-settings-card">
          <div className="lab-settings-head">
            <div>
              <h3>업로드 제한 설정</h3>
              <p>일일 업로드 제한 및 플랫폼 허용 여부를 설정합니다.</p>
            </div>
          </div>
          <div className="lab-settings-list">
            <label className="lab-settings-field">
              하루 업로드 최대 횟수
              <input
                type="number"
                min={1}
                max={100}
                value={dailyLimit}
                onChange={(event) => setDailyLimit(Number(event.target.value))}
              />
            </label>
            <div className="lab-settings-toggle">
              <span>YouTube 허용</span>
              <input
                type="checkbox"
                checked={platformAllowed.youtube}
                onChange={(event) =>
                  setPlatformAllowed((prev) => ({
                    ...prev,
                    youtube: event.target.checked
                  }))
                }
              />
            </div>
            <div className="lab-settings-toggle">
              <span>TikTok 허용</span>
              <input
                type="checkbox"
                checked={platformAllowed.tiktok}
                onChange={(event) =>
                  setPlatformAllowed((prev) => ({
                    ...prev,
                    tiktok: event.target.checked
                  }))
                }
              />
            </div>
            <div className="lab-settings-toggle">
              <span>Instagram 허용</span>
              <input
                type="checkbox"
                checked={platformAllowed.instagram}
                onChange={(event) =>
                  setPlatformAllowed((prev) => ({
                    ...prev,
                    instagram: event.target.checked
                  }))
                }
              />
            </div>
          </div>
          <div className="lab-settings-actions">
            <button className="btn primary" onClick={handleSave}>
              저장
            </button>
          </div>
        </section>

        <section className="lab-settings-card">
          <div className="lab-settings-head">
            <div>
              <h3>운영 모드</h3>
              <p>테스트 모드는 실제 업로드 없이 검증만 수행합니다.</p>
            </div>
          </div>
          <div className="lab-radio-group">
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === "PRODUCTION"}
                onChange={() => setMode("PRODUCTION")}
              />
              실제 업로드 모드 (PRODUCTION)
            </label>
            <label>
              <input
                type="radio"
                name="mode"
                checked={mode === "DRY_RUN"}
                onChange={() => setMode("DRY_RUN")}
              />
              테스트 모드 (DRY_RUN)
            </label>
          </div>
        </section>
      </div>
    </section>
  );
}
