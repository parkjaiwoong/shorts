import { buildPartnerUrl, readMalls } from "../data";
import ProductCard from "../ProductCard";

type PageProps = {
  params: { mallId: string };
};

export default async function ShopMallPage({ params }: PageProps) {
  const malls = await readMalls();
  const mall = malls.find((item) => item.id === params.mallId);

  if (!mall) {
    return (
      <section>
        <div style={{ fontSize: 22, fontWeight: 700 }}>쇼핑몰을 찾을 수 없습니다.</div>
        <div style={{ color: "#94a3b8", marginTop: 6 }}>
          올바른 링크인지 확인해주세요.
        </div>
      </section>
    );
  }

  const utm = {
    source: mall.utmSource,
    medium: mall.utmMedium,
    campaign: mall.utmCampaign
  };

  return (
    <section>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{mall.name}</div>
      <div style={{ color: "#94a3b8", marginTop: 6 }}>{mall.description}</div>

      <div
        style={{
          display: "grid",
          gap: 20,
          marginTop: 24,
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))"
        }}
      >
        {(mall.products || []).map((product) => {
          const link = buildPartnerUrl(product.baseUrl, mall.partnerCode, utm);
          return (
            <ProductCard
              key={product.id}
              product={product}
              mallId={mall.id}
              link={link}
            />
          );
        })}
      </div>
    </section>
  );
}
