import NavBar from "@/components/navBar/NavBar";
import { AuthProvider } from "@/context/AuthContext";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <div style={{ display: "flex", height: "100vh" }}>
        <NavBar />
        <main
          style={{
            flexGrow: 1,
            padding: "var(--mantine-spacing-lg)",
            overflowY: "auto",
          }}
        >
          <div style={{ marginTop: "var(--mantine-spacing-md)" }}>
            {children}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}
