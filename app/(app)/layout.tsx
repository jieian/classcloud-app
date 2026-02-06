// app/(app)/layout.tsx
import NavBar from "@/components/navBar/NavBar";
import { PageHeader } from "./page-header";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <NavBar />
      <main
        style={{
          flexGrow: 1,
          padding: "var(--mantine-spacing-lg)",
          overflowY: "auto",
        }}
      >
        <PageHeader />
        <div style={{ marginTop: "var(--mantine-spacing-md)" }}>{children}</div>
      </main>
    </div>
  );
}
