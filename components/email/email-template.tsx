interface EmailTemplateProps {
  firstName: string;
  lastName: string;
  email: string; // Added
  password: string; // Added
}

export function EmailTemplate({
  firstName,
  lastName,
  email,
  password,
}: EmailTemplateProps) {
  return (
    <div style={{ backgroundColor: "#f9f9f9", padding: "40px" }}>
      <div
        style={{
          backgroundColor: "#fff",
          padding: "20px",
          borderRadius: "8px",
          border: "1px solid #ddd",
        }}
      >
        <h1 style={{ fontSize: "20px", marginBottom: "20px" }}>
          Welcome to ClassCloud, {firstName}!
        </h1>
        <p>
          Your administrative account has been created. Here are your login
          details:
        </p>

        <div
          style={{
            backgroundColor: "#f0f7ff",
            padding: "15px",
            borderRadius: "4px",
          }}
        >
          <p>
            <strong>Email:</strong> {email}
          </p>
          <p>
            <strong>Temporary Password:</strong>{" "}
            <code style={{ color: "#d63384" }}>{password}</code>
          </p>
        </div>

        <p style={{ marginTop: "20px", fontSize: "14px", color: "#666" }}>
          Please log in and change your password immediately.
        </p>
      </div>
    </div>
  );
}
