import { ReactNode } from "react";

export default function QuoteLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#F7F3EC" }}>
      {children}
    </div>
  );
}
