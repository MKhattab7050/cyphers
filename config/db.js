const mysql = require('mysql2');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// إعداد الاتصال بقاعدة البيانات من .env
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root', 
    password: process.env.DB_PASS || '', 
    database: process.env.DB_NAME || 'final-db', 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000, // 10 seconds timeout
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Log database configuration (without password)
console.log('📊 Database Configuration:');
console.log('   Host:', process.env.DB_HOST || 'localhost');
console.log('   User:', process.env.DB_USER || 'root');
console.log('   Database:', process.env.DB_NAME || 'final-db');
console.log('   Password:', process.env.DB_PASS ? '***SET***' : '***EMPTY***');

// وظيفة عامة لتنفيذ الاستعلامات
const query = async (sql, params = []) => {
    try {
        const [rows] = await pool.promise().execute(sql, params);
        return rows;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

// استرجاع آخر 50 رسالة من غرفة معينة
const getMessagesByRoom = async (room) => {
    try {
        const sql = `
            SELECT 
                id,
                username,
                room,
                text,
                type,
                file_id,
                replyTo,
                timestamp,
                mediaUrl,
                mediaType,
                replyToUsername,
                replyToText
            FROM messages 
            WHERE room = ? 
            ORDER BY timestamp DESC, id DESC 
            LIMIT 50
        `;
        return (await query(sql, [room])).reverse();
    } catch (error) {
        console.error('Error getting messages by room:', error);
        throw error;
    }
};

// استرجاع رسالة بالمعرف
const getMessageById = async (id) => {
    try {
        const sql = 'SELECT * FROM messages WHERE id = ?';
        const rows = await query(sql, [id]);
        return rows[0] || null; // إذا كانت الرسالة موجودة، ستُرجع أول صف
    } catch (error) {
        console.error('Error getting message by ID:', error);
        throw error;
    }
};

// حفظ الرسالة في قاعدة البيانات
const saveMessage = async (messageData) => {
    try {
        const sql = `
            INSERT INTO messages 
            (username, room, text, type, file_id, replyTo, timestamp, mediaUrl, mediaType, replyToUsername, replyToText)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const params = [
            messageData.username,
            messageData.room,
            messageData.text || null,
            messageData.type || 'text',
            messageData.file_id || null,
            messageData.replyTo || null,
            messageData.timestamp || new Date(),
            messageData.mediaUrl || null,
            messageData.mediaType || null,
            messageData.replyToUsername || null,
            messageData.replyToText || null
        ];

        const result = await pool.promise().execute(sql, params);
        
        return {
            insertId: result[0].insertId,
            affectedRows: result[0].affectedRows,
            ...messageData
        };
    } catch (error) {
        console.error('Error saving message:', error);
        throw error;
    }
};

// حفظ طلب الصداقة في قاعدة البيانات
const saveFriendRequest = async (requestData) => {
    try {
        const sql = `
            INSERT INTO friend_requests 
            (from_user, to_user, status, created_at)
            VALUES (?, ?, 'pending', NOW())
        `;
        
        const result = await pool.promise().execute(sql, [
            requestData.from,
            requestData.to
        ]);
        
        return {
            insertId: result[0].insertId,
            affectedRows: result[0].affectedRows
        };
    } catch (error) {
        console.error('Error saving friend request:', error);
        throw error;
    }
};

// استرجاع طلبات الصداقة للمستخدم
const getFriendRequests = async (username) => {
    try {
        const sql = `
            SELECT 
                id,
                from_user as from_username,
                to_user as to_username,
                status,
                created_at
            FROM friend_requests 
            WHERE to_user = ? AND status = 'pending'
            ORDER BY created_at DESC
        `;
        
        return await query(sql, [username]);
    } catch (error) {
        console.error('Error getting friend requests:', error);
        throw error;
    }
};

// تحديث حالة طلب الصداقة
const updateFriendRequestStatus = async (requestId, status) => {
    try {
        const sql = `
            UPDATE friend_requests 
            SET status = ?, updated_at = NOW()
            WHERE id = ?
        `;
        
        const result = await pool.promise().execute(sql, [status, requestId]);
        return {
            affectedRows: result[0].affectedRows
        };
    } catch (error) {
        console.error('Error updating friend request status:', error);
        throw error;
    }
};

// إضافة صديق إلى قائمة الأصدقاء
const addFriend = async (user1, user2) => {
    try {
        const sql = `
            INSERT INTO friends 
            (user1, user2, created_at)
            VALUES (?, ?, NOW())
        `;
        
        const result = await pool.promise().execute(sql, [user1, user2].sort());
        return {
            affectedRows: result[0].affectedRows
        };
    } catch (error) {
        console.error('Error adding friend:', error);
        throw error;
    }
};

// استرجاع قائمة الأصدقاء
const getFriends = async (username) => {
    try {
        const sql = `
            SELECT 
                CASE 
                    WHEN user1 = ? THEN user2
                    ELSE user1
                END as friend_username,
                created_at
            FROM friends 
            WHERE user1 = ? OR user2 = ?
            ORDER BY created_at DESC
        `;
        
        return await query(sql, [username, username, username]);
    } catch (error) {
        console.error('Error getting friends:', error);
        throw error;
    }
};

// حذف صديق
const removeFriend = async (user1, user2) => {
    try {
        const sql = `
            DELETE FROM friends 
            WHERE (user1 = ? AND user2 = ?) 
               OR (user1 = ? AND user2 = ?)
        `;
        
        const result = await pool.promise().execute(sql, [user1, user2, user2, user1]);
        return {
            affectedRows: result[0].affectedRows
        };
    } catch (error) {
        console.error('Error removing friend:', error);
        throw error;
    }
};

// إغلاق الاتصال
const closeConnection = async () => {
    try {
        await pool.promise().end();
        console.log('Database connection closed.');
    } catch (error) {
        console.error('Error closing database connection:', error);
    }
};

// اختبار الاتصال
const testConnection = async () => {
    try {
        const [rows] = await pool.promise().query('SELECT 1');
        console.log('✅ Database connection successful');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        console.error('   Code:', error.code);
        console.error('   errno:', error.errno);
        
        // Provide helpful error messages
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('   ⚠️  Access denied - check DB_USER and DB_PASS in .env');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('   ⚠️  Database not found - check DB_NAME in .env');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('   ⚠️  Connection refused - check if MySQL is running and DB_HOST is correct');
        } else if (error.code === 'ENOTFOUND') {
            console.error('   ⚠️  Host not found - check DB_HOST in .env');
        }
        
        return false;
    }
};

// Call testConnection explicitly when needed.

module.exports = {
    // Database connection
    pool,
    query,
    
    // Message functions
    getMessagesByRoom,
    getMessageById,
    saveMessage,
    
    // Friend system functions
    saveFriendRequest,
    getFriendRequests,
    updateFriendRequestStatus,
    addFriend,
    getFriends,
    removeFriend,
    
    // Utility functions
    closeConnection,
    testConnection
};