/**
 * Check Messages Script - Debug why messages don't show
 */

require('dotenv').config();
const MessageModel = require('./Models/messageModel');
const db = require('./config/db');

async function checkMessages() {
    try {
        console.log('🔍 Checking database messages...\n');

        // Test 1: Check if messages exist
        console.log('📊 Test 1: Count all messages');
        const countResult = await db.query('SELECT COUNT(*) as total FROM messages');
        const total = countResult[0]?.total || countResult.total || 0;
        console.log(`   Total messages in database: ${total}\n`);

        // Test 2: Check messages by room
        console.log('📊 Test 2: Messages per room');
        const roomsResult = await db.query(`
            SELECT room, COUNT(*) as count, type 
            FROM messages 
            GROUP BY room, type 
            ORDER BY room, type
        `);
        
        if (roomsResult.length > 0) {
            roomsResult.forEach(row => {
                console.log(`   ${row.room}: ${row.count} ${row.type} messages`);
            });
        } else {
            console.log('   No messages found');
        }
        console.log();

        // Test 3: Get messages from General room using MessageModel
        console.log('📊 Test 3: Get General room messages via MessageModel');
        try {
            const messages = await MessageModel.getMessagesByRoom('General', 10);
            console.log(`   Retrieved ${messages.length} messages from General room`);
            
            if (messages.length > 0) {
                console.log('\n   Sample message:');
                const sample = messages[0];
                console.log('   {');
                console.log(`     id: ${sample.id}`);
                console.log(`     username: ${sample.username}`);
                console.log(`     room: ${sample.room}`);
                console.log(`     type: ${sample.type}`);
                console.log(`     text: ${sample.text ? sample.text.substring(0, 50) : 'null'}`);
                console.log(`     file_id: ${sample.file_id}`);
                console.log(`     timestamp: ${sample.timestamp}`);
                console.log('   }');
            }
        } catch (error) {
            console.log('   ❌ Error:', error.message);
        }
        console.log();

        // Test 4: Check raw query
        console.log('📊 Test 4: Raw SQL query');
        const rawMessages = await db.query(`
            SELECT id, username, room, text, type, file_id, timestamp
            FROM messages 
            WHERE room = 'General' 
            ORDER BY timestamp DESC 
            LIMIT 5
        `);
        console.log(`   Raw query returned ${rawMessages.length} messages`);
        
        if (rawMessages.length > 0) {
            console.log('\n   First message:');
            console.log('   ', JSON.stringify(rawMessages[0], null, 2));
        }
        console.log();

        // Test 5: Check is_private column
        console.log('📊 Test 5: Check is_private filtering');
        const privateCount = await db.query(`
            SELECT 
                COUNT(CASE WHEN is_private = 1 THEN 1 END) as private_count,
                COUNT(CASE WHEN is_private = 0 OR is_private IS NULL THEN 1 END) as public_count
            FROM messages 
            WHERE room = 'General'
        `);
        const counts = privateCount[0] || privateCount;
        console.log(`   Public messages: ${counts.public_count || 0}`);
        console.log(`   Private messages: ${counts.private_count || 0}`);
        console.log();

        // Test 6: Check file-related messages
        console.log('📊 Test 6: Check file messages');
        const fileMessages = await db.query(`
            SELECT m.id, m.username, m.type, m.file_id, f.original_name, f.duration
            FROM messages m
            LEFT JOIN files f ON m.file_id = f.id
            WHERE m.room = 'General' AND (m.type = 'file' OR m.type = 'voice')
            LIMIT 5
        `);
        console.log(`   File/Voice messages: ${fileMessages.length}`);
        
        if (fileMessages.length > 0) {
            fileMessages.forEach(msg => {
                console.log(`   - ${msg.type}: ${msg.original_name || 'unknown'} (duration: ${msg.duration || 'N/A'})`);
            });
        }
        console.log();

        // Summary
        console.log('═══════════════════════════════════════');
        if (total === 0) {
            console.log('⚠️  No messages in database!');
            console.log('💡 Send a test message from the chat app');
        } else {
            console.log('✅ Messages exist in database');
            console.log('💡 If messages still not showing:');
            console.log('   1. Check browser console (F12)');
            console.log('   2. Check socket connection');
            console.log('   3. Restart server: npm start');
        }
        console.log('═══════════════════════════════════════');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await db.closeConnection();
        process.exit(0);
    }
}

checkMessages();
