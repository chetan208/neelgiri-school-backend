import pg from 'pg';
const { Client } = pg;

const connectionString = "postgresql://neondb_owner:npg_6mnwYeA4uqQc@ep-patient-cloud-apoqmtaj.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require";

async function run() {
  console.log("Connecting to:", connectionString);
  const client = new Client({ connectionString });
  try {
    await client.connect();
    console.log("SUCCESS: Connected to database!");
    const res = await client.query('SELECT NOW()');
    console.log("Result:", res.rows[0]);
  } catch (err) {
    console.error("FAILURE: Connection error:", err.message);
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
