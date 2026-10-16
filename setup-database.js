require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const migrateDatabase = require('./migrate-database');
async function setupDatabase() {
 const name = process.env.DB_NAME || 'final-db';
 if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid DB_NAME');
 const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASS || '', multipleStatements: true });
 try {
  const sql = fs.readFileSync(path.join(__dirname, 'database-setup.sql'), 'utf8').replaceAll('final-db', name);
  await connection.query(sql);
  await migrateDatabase(connection);
  console.log('Database setup completed');
 } finally { await connection.end(); }
}
if (require.main === module) setupDatabase().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = setupDatabase;
