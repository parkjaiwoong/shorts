"use client";

import { useState } from "react";

type ProductCardProps = {
  product: {
    id: string;
    name: string;
    imageUrl?: string;
    baseUrl: string;
    coupaIframe?: string;
  };
  mallId: string;
  link: string;
};

export default function ProductCard({ product, mallId, link }: ProductCardProps) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    void fetch("/api/shop/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mallId,
        productId: product.id,
        productName: product.name,
        url: link,
        action: "click",
        referrer: document.referrer || "",
        userAgent: navigator.userAgent || ""
      })
    });
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      void fetch("/api/shop/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mallId,
          productId: product.id,
          productName: product.name,
          url: link,
          action: "copy",
          referrer: document.referrer || "",
          userAgent: navigator.userAgent || ""
        })
      });
    } catch (error) {
      console.error("링크 복사 실패:", error);
    }
  };

  return (
    <div
      style={{
        border: "1px solid rgba(148,163,184,0.15)",
        borderRadius: 16,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        background: "#111827",
        color: "inherit",
        overflow: "hidden",
        transition: "all 0.2s ease",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        position: "relative"
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
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        onClick={handleClick}
        style={{
          textDecoration: "none",
          color: "inherit",
          display: "flex",
          flexDirection: "column",
          flex: 1
        }}
      >
        <div
          style={{
            background: "#0f1117",
            padding: 0,
            textAlign: "center",
            position: "relative",
            aspectRatio: "1",
            overflow: "hidden"
          }}
        >
          <img
            src={product.imageUrl || "https://via.placeholder.com/400x400?text=Product"}
            alt={product.name}
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
        </div>
        <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              lineHeight: 1.4,
              marginBottom: 12,
              minHeight: "2.8em",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden"
            }}
          >
            {product.name}
          </div>
        </div>
      </a>
      {product.coupaIframe && (
        <div
          style={{
            padding: "0 16px 12px",
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
          }}
          dangerouslySetInnerHTML={{ __html: product.coupaIframe }}
        />
      )}
      <a
        href={link}
        target="_blank"
        rel="noreferrer"
        onClick={handleClick}
        style={{
          textDecoration: "none",
          color: "inherit",
          padding: "0 16px 16px"
        }}
      >
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            textAlign: "center",
            transition: "all 0.2s ease",
            boxShadow: "0 2px 8px rgba(37,99,235,0.3)"
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(37,99,235,0.5)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)";
            e.currentTarget.style.boxShadow = "0 2px 8px rgba(37,99,235,0.3)";
          }}
        >
          바로 구매하기 →
        </div>
      </a>
      <button
        onClick={handleCopyLink}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          background: copied ? "rgba(34,197,94,0.9)" : "rgba(0,0,0,0.7)",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s ease",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 4
        }}
        onMouseEnter={(e) => {
          if (!copied) {
            e.currentTarget.style.background = "rgba(0,0,0,0.9)";
          }
        }}
        onMouseLeave={(e) => {
          if (!copied) {
            e.currentTarget.style.background = "rgba(0,0,0,0.7)";
          }
        }}
      >
        {copied ? "✓ 복사됨" : "🔗 링크"}
      </button>
    </div>
  );
}
