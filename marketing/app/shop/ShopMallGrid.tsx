"use client";

type MallItem = {
  id: string;
  name: string;
  description?: string;
  products?: { imageUrl?: string }[];
};

export default function ShopMallGrid({ malls }: { malls: MallItem[] }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 20,
        marginTop: 24,
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))"
      }}
    >
      {malls.map((mall) => {
        const productCount = mall.products?.length || 0;
        const firstProductImage = mall.products?.[0]?.imageUrl;
        return (
          <a
            key={mall.id}
            href={`/shop/${mall.id}`}
            style={{
              border: "1px solid rgba(148,163,184,0.15)",
              borderRadius: 16,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              background: "#111827",
              color: "inherit",
              textDecoration: "none",
              overflow: "hidden",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              cursor: "pointer"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = "0 8px 24px rgba(37,99,235,0.3)";
              e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
              e.currentTarget.style.borderColor = "rgba(148,163,184,0.15)";
            }}
          >
            {firstProductImage && (
              <div
                style={{
                  width: "100%",
                  height: 180,
                  background: "#0f1117",
                  position: "relative",
                  overflow: "hidden"
                }}
              >
                <img
                  src={firstProductImage}
                  alt={mall.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transition: "transform 0.3s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    background: "rgba(0,0,0,0.7)",
                    color: "#fff",
                    padding: "4px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {productCount}개 상품
                </div>
              </div>
            )}
            <div style={{ padding: "20px", flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{mall.name}</div>
              <div style={{ color: "#94a3b8", fontSize: 14, lineHeight: 1.5 }}>
                {mall.description || "다양한 상품을 확인해보세요."}
              </div>
              {!firstProductImage && productCount > 0 && (
                <div
                  style={{
                    marginTop: 12,
                    color: "#64748b",
                    fontSize: 13,
                    fontWeight: 500
                  }}
                >
                  {productCount}개 상품 보기 →
                </div>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}
