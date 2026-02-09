import { readMalls } from "./data";
import ShopMallGrid from "./ShopMallGrid";

export const dynamic = "force-dynamic";

export default async function ShopHome() {
  const malls = await readMalls();
  return (
    <section>
      <div style={{ fontSize: 22, fontWeight: 700 }}>추천 쇼핑몰</div>
      <div style={{ color: "#94a3b8", marginTop: 6 }}>
        영상에서 본 상품을 바로 확인하세요.
      </div>
      <ShopMallGrid malls={malls} />
    </section>
  );
}
