import { Skeleton } from "@mantine/core";
import { IconBellRingingFilled, IconSparkles } from "@tabler/icons-react";
import styles from "../page.module.css";

// Loading placeholder for the Home dashboard. Mirrors HomeClient's exact class
// structure so the same page.module.css media queries drive the responsive
// layout: on desktop the sidebar panels show; on mobile (<=768px) the split
// welcome + quick-actions strip show and the sidebar is hidden. No JS media
// query, so it renders correctly during server streaming with no flash.
export default function HomeSkeleton() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          {/* Desktop: single welcome line + school name */}
          <div className={styles.desktopWelcome}>
            <Skeleton height={32} width={240} radius="sm" />
          </div>
          <div className={styles.desktopSchoolName}>
            <Skeleton height={15} width={200} radius="sm" mt={10} />
          </div>
          {/* Mobile: "Welcome," / "Name!" on two lines */}
          <div className={styles.mobileWelcome} aria-hidden="true">
            <Skeleton height={26} width={120} radius="sm" />
            <Skeleton height={26} width={150} radius="sm" mt={6} />
          </div>
        </div>

        <div className={styles.termBlock} aria-hidden="true">
          <Skeleton height={22} width={130} radius="sm" />
          <Skeleton height={14} width={90} radius="sm" mt={8} />
        </div>
      </header>

      {/* Mobile-only quick-actions strip (hidden on desktop via CSS) */}
      <div className={styles.mobileQuickActions} aria-hidden="true">
        <div style={{ display: "flex", gap: 18, justifyContent: "space-between", marginTop: 18 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flex: 1 }}
            >
              <Skeleton height={52} width={52} radius="md" />
              <Skeleton height={10} width="80%" radius="sm" />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.contentGrid}>
        <main className={styles.mainArea} aria-label="Loading dashboard">
          <Skeleton height={180} radius="md" />
          <Skeleton height={220} radius="md" mt={16} />
        </main>

        {/* Sidebar — hidden on mobile via CSS (.sidebar { display: none }) */}
        <aside className={styles.sidebar} aria-hidden="true">
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <IconBellRingingFilled size={22} color="#ffffff" />
              <span>Notifications</span>
            </div>
            <div className={styles.panelBody}>
              <Skeleton height={14} mt={6} />
              <Skeleton height={14} mt={10} width="85%" />
              <Skeleton height={14} mt={10} width="90%" />
            </div>
          </section>

          <section className={styles.panel}>
            <div className={`${styles.panelHeader} ${styles.quickHeader}`}>
              <IconSparkles size={21} />
              <span>Quick Actions</span>
            </div>
            <div className={styles.panelBody}>
              <Skeleton height={32} mt={6} radius="sm" />
              <Skeleton height={32} mt={8} radius="sm" />
              <Skeleton height={32} mt={8} radius="sm" />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
