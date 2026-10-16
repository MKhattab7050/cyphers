# 📊 Cyphers Chat - Database Documentation

## 🎯 Overview
قاعدة بيانات **Cyphers Chat** مصممة لدعم:
- ✅ الرسائل النصية والصوتية
- ✅ مشاركة الملفات بكل أنواعها
- ✅ الرسائل الخاصة بين المستخدمين
- ✅ نظام الأصدقاء وطلبات الصداقة
- ✅ محفظة العملات الرقمية (Wallet)

---

## 🚀 Quick Start

### 1️⃣ إعداد قاعدة البيانات لأول مرة
```bash
npm run db:setup
```

### 2️⃣ تحديث قاعدة بيانات موجودة
```bash
npm run db:migrate
```

### 3️⃣ اختبار قاعدة البيانات
```bash
npm run db:test
```

---

## 📋 Database Schema

### 🔹 Users Table
تخزين معلومات المستخدمين والحسابات

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary Key |
| `username` | VARCHAR(255) | اسم المستخدم (فريد) |
| `email` | VARCHAR(255) | البريد الإلكتروني |
| `password` | VARCHAR(255) | كلمة المرور (مشفرة) |
| `google_id` | VARCHAR(255) | معرف Google للتسجيل |
| `display_name` | VARCHAR(255) | الاسم المعروض |
| `avatar_url` | TEXT | رابط الصورة الشخصية |
| `bio` | TEXT | نبذة عن المستخدم |
| `is_online` | TINYINT(1) | حالة الاتصال |
| `last_seen` | DATETIME | آخر ظهور |
| `status` | VARCHAR(50) | الحالة (online/offline/away) |
| `wallet_address` | VARCHAR(255) | عنوان المحفظة |
| `created_at` | TIMESTAMP | تاريخ التسجيل |
| `updated_at` | TIMESTAMP | تاريخ آخر تحديث |

### 🔹 Messages Table
تخزين جميع الرسائل (نصية، صوتية، ملفات)

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary Key |
| `username` | VARCHAR(255) | اسم المرسل |
| `room` | VARCHAR(255) | اسم الغرفة/المحادثة |
| `text` | TEXT | محتوى الرسالة النصية |
| `type` | VARCHAR(50) | نوع الرسالة (text/voice/file) |
| `file_id` | INT | معرف الملف (Foreign Key) |
| `replyTo` | TEXT | JSON للرسالة المردود عليها |
| `timestamp` | TIMESTAMP | وقت الإرسال |
| `is_private` | TINYINT(1) | رسالة خاصة؟ |
| `is_edited` | TINYINT(1) | تم التعديل؟ |
| `is_deleted` | TINYINT(1) | تم الحذف؟ |
| `created_at` | TIMESTAMP | تاريخ الإنشاء |
| `updated_at` | TIMESTAMP | تاريخ آخر تحديث |

### 🔹 Files Table
تخزين معلومات الملفات المرفوعة

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary Key |
| `filename` | VARCHAR(255) | اسم الملف على السيرفر |
| `original_name` | VARCHAR(255) | الاسم الأصلي للملف |
| `file_path` | TEXT | مسار الملف |
| `file_size` | BIGINT | حجم الملف بالبايت |
| `file_type` | VARCHAR(50) | نوع الملف |
| `mime_type` | VARCHAR(100) | MIME type |
| `duration` | INT | المدة بالثواني (للصوت والفيديو) |
| `username` | VARCHAR(255) | اسم المرسل |
| `room` | VARCHAR(255) | الغرفة |
| `created_at` | TIMESTAMP | تاريخ الرفع |

### 🔹 Friends Table
تخزين علاقات الصداقة

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary Key |
| `user1` | VARCHAR(255) | المستخدم الأول |
| `user2` | VARCHAR(255) | المستخدم الثاني |
| `created_at` | TIMESTAMP | تاريخ الصداقة |

### 🔹 Friend Requests Table
تخزين طلبات الصداقة

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT | Primary Key |
| `from_user` | VARCHAR(255) | المرسل |
| `to_user` | VARCHAR(255) | المستقبل |
| `status` | ENUM | pending/accepted/rejected |
| `created_at` | TIMESTAMP | تاريخ الطلب |
| `updated_at` | TIMESTAMP | تاريخ آخر تحديث |

---

## 🔧 Database Configuration

### ملف `.env`
```env
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=final-db
```

---

## 📝 Important Notes

### ✅ Voice Messages Support
- الرسائل الصوتية تُخزن في جدول `files`
- الـ `duration` يُحفظ بالثواني
- الـ `type` في `messages` يكون `'voice'`
- الـ `file_id` يربط الرسالة بالملف

### ✅ Private Messages
- الرسائل الخاصة تُخزن مع `is_private = 1`
- اسم الغرفة يكون: `private user1_user2`
- يمكن استرجاعها باستخدام `getPrivateMessages(user1, user2)`

### ✅ File Uploads
- الملفات تُرفع إلى مجلد `/uploads`
- معلومات الملف تُحفظ في `files` table
- الرابط بين الرسالة والملف عن طريق `file_id`

---

## 🛠️ Maintenance

### تنظيف الرسائل القديمة (أكثر من 90 يوم)
```sql
CALL clean_old_messages();
```

### احصائيات مستخدم
```sql
CALL get_user_stats('username');
```

### استعراض المستخدمين النشطين
```sql
SELECT * FROM active_users;
```

### استعراض آخر 100 رسالة
```sql
SELECT * FROM recent_messages;
```

---

## 🔍 Troubleshooting

### مشكلة: الرسائل الصوتية لا تظهر
✅ **الحل:**
```bash
npm run db:migrate
```

### مشكلة: Foreign Key Constraint Error
✅ **الحل:**
```sql
-- تأكد من وجود المستخدم أولاً
INSERT IGNORE INTO users (username) VALUES ('username');
```

### مشكلة: Connection Refused
✅ **الحل:**
1. تأكد من تشغيل MySQL
2. تحقق من بيانات `.env`
3. جرّب: `mysql -u root -p`

---

## 📊 Database Indexes

تم إضافة Indexes لتحسين الأداء:

```sql
-- Messages table
INDEX idx_username (username)
INDEX idx_room (room)
INDEX idx_timestamp (timestamp)
INDEX idx_room_timestamp (room, timestamp)
INDEX idx_is_private (is_private)

-- Files table
INDEX idx_username (username)
INDEX idx_room (room)

-- Users table
INDEX idx_username (username)
INDEX idx_is_online (is_online)
```

---

## 🎯 Future Enhancements

- [ ] Message reactions system
- [ ] Read receipts
- [ ] Message search with full-text index
- [ ] User blocking system
- [ ] Group chat management
- [ ] Message encryption

---

## 📞 Support

إذا واجهت أي مشكلة:
1. تحقق من الـ logs: `console.log` في Terminal
2. اختبر الاتصال: `npm run db:test`
3. أعد تشغيل Migration: `npm run db:migrate`

---

## ✅ Changelog

### Version 1.1.0 (Latest)
- ✅ Added `duration` column to `files` table
- ✅ Added `is_private`, `is_edited`, `is_deleted` to `messages` table
- ✅ Added `wallet_address` to `users` table
- ✅ Added performance indexes
- ✅ Fixed voice message storage

### Version 1.0.0
- Initial database schema
- Basic messaging system
- Friends system
- File uploads

---

Made with ❤️ by Cyphers Team
