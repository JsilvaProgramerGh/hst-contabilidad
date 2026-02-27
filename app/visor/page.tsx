import { Suspense } from "react";
import VisorClient from "./VisorClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "#d4af37", background: "#0b0b0b", minHeight: "100vh" }}>Cargando visor...</div>}>
      <VisorClient />
    </Suspense>
  );
}