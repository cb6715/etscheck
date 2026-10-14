import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #7c3aed, #ec4899)",
          color: "white",
          fontSize: 256,
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        V
      </div>
    ),
    { width: 512, height: 512 }
  );
}
