"use client";

interface MobileStepIndicatorProps {
  activeStep: number;
  totalSteps: number;
  stepDescription: string;
  hasError?: boolean;
}

export default function MobileStepIndicator({
  activeStep,
  totalSteps,
  stepDescription,
  hasError,
}: MobileStepIndicatorProps) {
  const progress = ((activeStep + 1) / totalSteps) * 100;
  const accentColor = hasError ? "#dc2626" : "#4EAE4A";

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "14px 16px 0 16px",
        marginBottom: 20,
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14 }}>
        <div
          className={hasError ? "wizard-pulse" : undefined}
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            backgroundColor: accentColor,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontWeight: 700,
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {activeStep + 1}
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#6b7280",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              lineHeight: 1.2,
              marginBottom: 2,
            }}
          >
            Step {activeStep + 1} / {totalSteps}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: hasError ? "#dc2626" : "#111827", lineHeight: 1.3 }}>
            {stepDescription}
          </div>
        </div>
      </div>
      <div style={{ height: 3, backgroundColor: "#e5e7eb", margin: "0 -16px" }}>
        <div
          style={{
            height: "100%",
            backgroundColor: accentColor,
            width: `${progress}%`,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
