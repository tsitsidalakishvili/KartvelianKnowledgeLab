export function hasCredentials() {
  return Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD);
}

export async function getDriver() {
  if (!hasCredentials()) {
    throw new Error(
      "Missing NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD. Run with: node --env-file=.env <script>"
    );
  }
  // Lazy import: snapshot/dry-run workflows work without `npm install`.
  const { default: neo4j } = await import("neo4j-driver");
  return neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
  );
}

export function getSession(driver) {
  return driver.session({ database: process.env.NEO4J_DATABASE || "neo4j" });
}
