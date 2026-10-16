const db = require('../config/db');

class FriendModel {
    // إرسال طلب صداقة
    static async sendFriendRequest(from, to) {
        const result = await db.query(
            'INSERT INTO friend_requests (from_user, to_user, status) VALUES (?, ?, "pending")',
            [from, to]
        );
        return result;
    }

    // الرد على طلب الصداقة
    static async respondToFriendRequest(from, to, accepted) {
        if (accepted) {
            // إضافة الصداقة إلى الجدول
            await db.query(
                'INSERT INTO friends (user1, user2) VALUES (?, ?)',
                [from, to]
            );
        }

        // تحديث حالة الطلب
        const result = await db.query(
            'UPDATE friend_requests SET status = ? WHERE from_user = ? AND to_user = ?',
            [accepted ? 'accepted' : 'rejected', from, to]
        );

        return result;
    }

    // إزالة صديق
    static async removeFriend(username1, username2) {
        const result = await db.query(
            'DELETE FROM friends WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)',
            [username1, username2, username2, username1]
        );
        return result;
    }

    // الحصول على قائمة الأصدقاء
    static async getFriendsList(username) {
        try {
            const friends = await db.query(`
                SELECT 
                    CASE 
                        WHEN user1 = ? THEN user2 
                        ELSE user1 
                    END as friend_username,
                    u.online_status as online,
                    u.status as status
                FROM friends f
                JOIN users u ON 
                    (f.user1 = u.username AND f.user1 != ?) OR 
                    (f.user2 = u.username AND f.user2 != ?)
                WHERE user1 = ? OR user2 = ?
            `, [username, username, username, username, username]);

            console.log('Raw query result for getFriendsList:', friends);
            return friends;
        } catch (error) {
            console.error('Error in FriendModel.getFriendsList:', error);
            throw error;
        }
    }

    // الحصول على طلبات الصداقة الواردة
    static async getFriendRequests(username) {
        const requests = await db.query(
            'SELECT from_user as `from` FROM friend_requests WHERE to_user = ? AND status = "pending"',
            [username]
        );
        return requests;
    }

    // الحصول على طلبات الصداقة الصادرة
    static async getPendingRequests(username) {
        const requests = await db.query(
            'SELECT to_user as `to` FROM friend_requests WHERE from_user = ? AND status = "pending"',
            [username]
        );
        return requests;
    }

    // البحث عن مستخدمين
    static async searchUsers(query) {
        const users = await db.query(
            'SELECT username, online_status as online FROM users WHERE username LIKE ? LIMIT 10',
            [`%${query}%`]
        );
        return users;
    }

    // إضافة صداقة
    static async addFriend(user1, user2) {
        try {
            // ترتيب المستخدمين لتجنب الإدخالات المكررة
            const [smallerUser, largerUser] = user1 < user2 ? [user1, user2] : [user2, user1];

            // تحقق من وجود الصداقة بالفعل في كلا الترتيبين
            const existingFriendship = await db.query(
                'SELECT * FROM friends WHERE (user1 = ? AND user2 = ?) OR (user1 = ? AND user2 = ?)',
                [smallerUser, largerUser, largerUser, smallerUser]
            );

            console.log('Existing friendship check result:', existingFriendship); // Log existing friendship check

            if (existingFriendship.length > 0) {
                console.warn(`Friendship between ${smallerUser} and ${largerUser} already exists.`);
                return { success: false, message: 'Friendship already exists' };
            }

            // إضافة الصداقة إلى الجدول
            const result = await db.query(
                'INSERT INTO friends (user1, user2, created_at) VALUES (?, ?, NOW())',
                [smallerUser, largerUser]
            );

            console.log('Friendship added successfully:', result); // Log successful addition

            return { success: true, result };
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                console.warn(`Duplicate entry detected for friendship between ${user1} and ${user2}.`);
                return { success: false, message: 'Duplicate entry detected' };
            }
            console.error('Error adding friendship:', error);
            throw error;
        }
    }

    // جلب قائمة الأصدقاء
    static async getFriends(username) {
        try {
            console.log(`Getting friends for user: ${username}`);
            
            const friends = await db.query(
                `SELECT DISTINCT
                    CASE 
                        WHEN friends.user1 = ? THEN friends.user2
                        ELSE friends.user1
                    END as friend_username,
                    users.status, 
                    users.avatar, 
                    users.online_status 
                FROM friends 
                JOIN users ON users.username = (
                    CASE 
                        WHEN friends.user1 = ? THEN friends.user2
                        ELSE friends.user1
                    END
                )
                WHERE friends.user1 = ? OR friends.user2 = ?`,
                [username, username, username, username]
            );

            console.log('Raw query result for getFriends:', friends);

            if (!Array.isArray(friends)) {
                console.error('Unexpected query result - not an array:', friends);
                return [];
            }

            if (friends.length === 0) {
                console.log(`No friends found for user: ${username}`);
                return [];
            }

            // Format results
            const friendList = friends.map(friend => ({
                username: friend.friend_username,
                status: friend.status || 'Available', // Default status if null
                avatar: friend.avatar || null,
                online: friend.online_status === 1
            }));

            console.log('Formatted friends list:', friendList);
            return friendList;
            
        } catch (error) {
            console.error('Error fetching friends list:', error);
            throw error;
        }
    }
}

module.exports = FriendModel;