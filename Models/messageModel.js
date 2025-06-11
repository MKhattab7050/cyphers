const db = require('../db');

class MessageModel {
    
    // حفظ رسالة جديدة
    static async saveMessage(messageData) {
        try {
            const sql = `
                INSERT INTO messages 
                (username, room, text, type, file_id, replyTo, timestamp, mediaUrl, mediaType, replyToUsername, replyToText)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            // تحضير البيانات
            const params = [
                messageData.username,
                messageData.room,
                messageData.text || null,
                messageData.type || 'text',
                messageData.file_id || null,
                messageData.replyTo ? (typeof messageData.replyTo === 'string' ? messageData.replyTo : JSON.stringify(messageData.replyTo)) : null,
                messageData.timestamp || new Date(),
                messageData.mediaUrl || null,
                messageData.mediaType || null,
                messageData.replyToUsername || null,
                messageData.replyToText || null
            ];

            const result = await db.query(sql, params);
            
            return {
                insertId: result.insertId || result[0]?.insertId,
                affectedRows: result.affectedRows || result[0]?.affectedRows,
                ...messageData
            };
        } catch (error) {
            console.error('Error in MessageModel.saveMessage:', error);
            throw error;
        }
    }

    // استرجاع الرسائل حسب الغرفة
    static async getMessagesByRoom(room, limit = 50) {
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
                ORDER BY timestamp ASC 
                LIMIT ?
            `;
            
            const messages = await db.query(sql, [room, limit]);
            
            // تحويل replyTo من JSON string إلى object إذا لزم الأمر
            return messages.map(message => {
                if (message.replyTo && typeof message.replyTo === 'string') {
                    try {
                        message.replyTo = JSON.parse(message.replyTo);
                    } catch (e) {
                        console.warn('Failed to parse replyTo JSON:', e);
                    }
                }
                return message;
            });
        } catch (error) {
            console.error('Error in MessageModel.getMessagesByRoom:', error);
            throw error;
        }
    }

    // استرجاع رسالة واحدة بالمعرف
    static async getMessageById(id) {
        try {
            const sql = 'SELECT * FROM messages WHERE id = ?';
            const messages = await db.query(sql, [id]);
            
            if (messages.length === 0) {
                return null;
            }
            
            const message = messages[0];
            
            // تحويل replyTo من JSON string إلى object إذا لزم الأمر
            if (message.replyTo && typeof message.replyTo === 'string') {
                try {
                    message.replyTo = JSON.parse(message.replyTo);
                } catch (e) {
                    console.warn('Failed to parse replyTo JSON:', e);
                }
            }
            
            return message;
        } catch (error) {
            console.error('Error in MessageModel.getMessageById:', error);
            throw error;
        }
    }

    // حذف رسالة
    static async deleteMessage(id, username) {
        try {
            const sql = 'DELETE FROM messages WHERE id = ? AND username = ?';
            const result = await db.query(sql, [id, username]);
            
            return {
                affectedRows: result.affectedRows || result[0]?.affectedRows || 0
            };
        } catch (error) {
            console.error('Error in MessageModel.deleteMessage:', error);
            throw error;
        }
    }

    // تحديث رسالة
    static async updateMessage(id, username, newText) {
        try {
            const sql = 'UPDATE messages SET text = ?, updated_at = NOW() WHERE id = ? AND username = ?';
            const result = await db.query(sql, [newText, id, username]);
            
            return {
                affectedRows: result.affectedRows || result[0]?.affectedRows || 0
            };
        } catch (error) {
            console.error('Error in MessageModel.updateMessage:', error);
            throw error;
        }
    }

    // البحث في الرسائل
    static async searchMessages(room, searchTerm, limit = 20) {
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
                WHERE room = ? AND (text LIKE ? OR username LIKE ?)
                ORDER BY timestamp DESC 
                LIMIT ?
            `;
            
            const searchPattern = `%${searchTerm}%`;
            const messages = await db.query(sql, [room, searchPattern, searchPattern, limit]);
            
            return messages.map(message => {
                if (message.replyTo && typeof message.replyTo === 'string') {
                    try {
                        message.replyTo = JSON.parse(message.replyTo);
                    } catch (e) {
                        console.warn('Failed to parse replyTo JSON:', e);
                    }
                }
                return message;
            });
        } catch (error) {
            console.error('Error in MessageModel.searchMessages:', error);
            throw error;
        }
    }

    // احصائيات الرسائل للغرفة
    static async getMessageStats(room) {
        try {
            const sql = `
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(DISTINCT username) as unique_users,
                    COUNT(CASE WHEN type = 'file' THEN 1 END) as file_messages,
                    MIN(timestamp) as first_message,
                    MAX(timestamp) as last_message
                FROM messages 
                WHERE room = ?
            `;
            
            const stats = await db.query(sql, [room]);
            return stats[0] || {};
        } catch (error) {
            console.error('Error in MessageModel.getMessageStats:', error);
            throw error;
        }
    }

    // احصائيات المستخدم
    static async getUserMessageStats(username, room = null) {
        try {
            let sql = `
                SELECT 
                    COUNT(*) as total_messages,
                    COUNT(DISTINCT room) as rooms_participated,
                    COUNT(CASE WHEN type = 'file' THEN 1 END) as files_shared,
                    MIN(timestamp) as first_message,
                    MAX(timestamp) as last_message
                FROM messages 
                WHERE username = ?
            `;
            
            const params = [username];
            
            if (room) {
                sql += ' AND room = ?';
                params.push(room);
            }
            
            const stats = await db.query(sql, params);
            return stats[0] || {};
        } catch (error) {
            console.error('Error in MessageModel.getUserMessageStats:', error);
            throw error;
        }
    }

    // تنظيف الرسائل القديمة
    static async cleanupOldMessages(daysOld = 30) {
        try {
            const sql = 'DELETE FROM messages WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)';
            const result = await db.query(sql, [daysOld]);
            
            return {
                deletedCount: result.affectedRows || result[0]?.affectedRows || 0
            };
        } catch (error) {
            console.error('Error in MessageModel.cleanupOldMessages:', error);
            throw error;
        }
    }
}

module.exports = MessageModel;