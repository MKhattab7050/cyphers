// Script to update file paths from /uploads/ to /saves/ in database
const mysql = require('mysql2/promise');
require('dotenv').config({path:require('path').join(__dirname,'.env')});

async function updateFilePaths() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'final-db'
    });

    try {
        console.log('Connected to database');

        // Update files table - change uploads folder path to saves
        const [filesResult] = await connection.query(`
            UPDATE files 
            SET file_path = REPLACE(file_path, 'uploads', 'saves')
            WHERE file_path LIKE '%uploads%'
        `);
        
        console.log(`✅ Updated ${filesResult.affectedRows} file paths in files table`);

        console.log('✅ All file paths updated successfully!');
        console.log('Note: Old uploads folder still exists. You can delete it manually if all files are in saves/');

    } catch (error) {
        console.error('❌ Error updating file paths:', error);
    } finally {
        await connection.end();
    }
}

updateFilePaths().catch(error => { console.error(error.message); process.exitCode = 1; });
