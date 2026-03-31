import { Suspense } from "react";
import NavBar from "@/components/navBar/NavBar";
import { AuthProvider } from "@/context/AuthContext";
import styles from "./layout.module.css";

// Full-screen spinner shown during SSR streaming of the authenticated shell.
// NavBar uses usePathname() and pages use useParams() — both are dynamic in the
// cacheComponents model. One Suspense boundary here covers all of them correctly
// (Next.js 16 Partial Prerender pattern).
function AppShellFallback() {
  return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        width: 36,
        height: 36,
        border: "3px solid #e9ecef",
        borderTopColor: "#4EAE4A",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <AuthProvider>
        <div style={{ display: "flex", height: "100vh" }}>
          <NavBar />
          <main className={styles.main}>
            <div style={{ marginTop: "var(--mantine-spacing-md)" }}>
              {children}
            </div>
          </main>
        </div>
      </AuthProvider>
    </Suspense>
  );
}
