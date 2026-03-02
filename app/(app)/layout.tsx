import NavBar from "@/components/navBar/NavBar";
import { AuthProvider } from "@/context/AuthContext";
import styles from "./layout.module.css";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
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
  );
}
