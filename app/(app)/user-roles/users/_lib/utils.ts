/**
 * Shared utilities for user-roles module
 */

export const passwordRequirements = [
  { re: /[0-9]/, label: "Includes number" },
  { re: /[a-z]/, label: "Includes lowercase letter" },
  { re: /[A-Z]/, label: "Includes uppercase letter" },
  { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: "Includes special symbol" },
];

export function getPasswordStrength(password: string): number {
  let multiplier = password.length >= 8 ? 0 : 1;
  passwordRequirements.forEach((requirement) => {
    if (!requirement.re.test(password)) {
      multiplier += 1;
    }
  });
  return Math.max(
    100 - (100 / (passwordRequirements.length + 1)) * multiplier,
    0,
  );
}

/**
 * Converts string to Title Case and normalizes whitespace
 * "  jOHN    DOE  " → "John Doe"
 */
export function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Generate secure password using crypto.getRandomValues()
 */
export function generateSecurePassword(): string {
  const length = 16;
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "$&+,:;=?@#|<>.^*()%!-";
  const allChars = lowercase + uppercase + numbers + special;

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  // Guarantee at least one of each required type
  const password = [
    lowercase[array[0] % lowercase.length],
    uppercase[array[1] % uppercase.length],
    numbers[array[2] % numbers.length],
    special[array[3] % special.length],
  ];

  // Fill remaining with random chars
  for (let i = 4; i < length; i++) {
    password.push(allChars[array[i] % allChars.length]);
  }

  // Fisher-Yates shuffle with crypto random
  const shuffleArray = new Uint32Array(password.length);
  crypto.getRandomValues(shuffleArray);
  for (let i = password.length - 1; i > 0; i--) {
    const j = shuffleArray[i] % (i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join("");
}