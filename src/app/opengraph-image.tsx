/* eslint-disable @next/next/no-img-element */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { brand } from "@/lib/brand";

export const alt = `${brand.name}: find what is holding your website back`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "onread-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#071011",
        color: "#f8fafc",
        padding: "68px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: "62%" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "24px",
            fontWeight: 700,
          }}
        >
          <img
            src={logoSrc}
            alt=""
            width={50}
            height={50}
            style={{
              width: "50px",
              height: "50px",
              borderRadius: "8px",
              objectFit: "cover",
            }}
          />
          {brand.name}
        </div>
        <div
          style={{
            marginTop: "72px",
            fontSize: "58px",
            lineHeight: 1.08,
            fontWeight: 700,
            letterSpacing: "0px",
          }}
        >
          Find what&apos;s holding your website back.
        </div>
        <div
          style={{
            marginTop: "32px",
            fontSize: "22px",
            lineHeight: 1.45,
            color: "#cbd5e1",
          }}
        >
          Website and SEO evidence, prioritized fixes, and progress you can
          verify.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          width: "38%",
          paddingLeft: "54px",
        }}
      >
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            border: "1px solid #2d3d3f",
            borderRadius: "8px",
            background: "#0d1718",
            padding: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "14px",
                  color: "#5eead4",
                  textTransform: "uppercase",
                }}
              >
                Website Growth Score
              </span>
              <span
                style={{ marginTop: "8px", fontSize: "24px", fontWeight: 700 }}
              >
                Harbor &amp; Pine
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "76px",
                height: "76px",
                borderRadius: "50%",
                border: "8px solid #5eead4",
                fontSize: "28px",
                fontWeight: 700,
              }}
            >
              72
            </div>
          </div>
          <div
            style={{
              marginTop: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {[
              ["Top opportunity", "Clarify the homepage offer"],
              ["SEO evidence", "Five page descriptions missing"],
              ["Generated fix", "Three headline options ready"],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  border: "1px solid #253537",
                  borderRadius: "6px",
                  padding: "14px",
                }}
              >
                <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {label}
                </span>
                <span style={{ marginTop: "5px", fontSize: "16px" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
