require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mysql = require('mysql2/promise');
async function migrateDatabase(connection) {
 const changes = {
  users: { google_id: 'VARCHAR(255)', name: 'VARCHAR(255)', avatar: 'TEXT', online_status: 'TINYINT(1) DEFAULT 0', username: 'VARCHAR(255)', status: "VARCHAR(50) DEFAULT 'Available'", display_name: 'VARCHAR(255)', avatar_url: 'TEXT', bio: 'TEXT', is_online: 'TINYINT(1) DEFAULT 0', last_seen: 'DATETIME DEFAULT CURRENT_TIMESTAMP', wallet_address: 'VARCHAR(255)' },
  files: { duration: 'INT DEFAULT NULL' },
  messages: { is_private: 'TINYINT(1) DEFAULT 0', is_edited: 'TINYINT(1) DEFAULT 0', is_deleted: 'TINYINT(1) DEFAULT 0', updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
 };
 for (const [table, columns] of Object.entries(changes)) {
  const [existing] = await connection.query('SHOW COLUMNS FROM ' + table);
  const names = new Set(existing.map(c => c.Field));
  for (const [column, type] of Object.entries(columns)) {
   if (!names.has(column)) await connection.query('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + type);
  }
 }
 console.log('Schema migration completed');
}
async function main() {
 const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASS || '', database: process.env.DB_NAME || 'final-db' });
 try { await migrateDatabase(connection); } finally { await connection.end(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = migrateDatabase;
