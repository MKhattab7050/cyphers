# نقل الملفات من uploads إلى saves

## ما تم عمله

### 1. تغيير مسار حفظ الملفات
- **القديم**: `uploads/`
- **الجديد**: `saves/`

### 2. التعديلات في السيرفر (server.js)
```javascript
// القديم
const uploadsDir = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsDir));

// الجديد
const savesDir = path.join(__dirname, 'saves');
app.use('/saves', express.static(savesDir));
```

### 3. التعديلات في الكلاينت (chat-script.js)
```javascript
// القديم
return u.startsWith('/uploads/') ? sanitizeHTML(u) : '';

// الجديد (يدعم الاثنين)
return (u.startsWith('/saves/') || u.startsWith('/uploads/') || u.startsWith('https://')) ? sanitizeHTML(u) : '';
```

### 4. نقل الملفات الموجودة
- تم إنشاء فولدر `saves/` جديد
- تم نسخ **57 ملف** من `uploads/` إلى `saves/`
- تم تحديث **22 سجل** في قاعدة البيانات (جدول files)

### 5. تحديث قاعدة البيانات
استخدمنا السكريبت `update-file-paths.js` لتحديث المسارات:
```sql
UPDATE files 
SET file_path = REPLACE(file_path, 'uploads', 'saves')
WHERE file_path LIKE '%uploads%'
```

## الملفات المعدلة
1. ✅ `server.js` - تغيير المسارات والتوجيهات
2. ✅ `client/chat-script.js` - تحديث safeFileUrl
3. ✅ `saves/` - فولدر جديد (57 ملف)
4. ✅ Database - 22 سجل محدث

## الملفات الجديدة
- `update-file-paths.js` - سكريبت تحديث المسارات (يمكن حذفه بعد الاستخدام)
- `saves/` - فولدر الملفات الجديد

## حذف الفولدر القديم (اختياري)
بعد التأكد من عمل كل شيء، يمكنك حذف فولدر `uploads/`:
```bash
# تحذير: تأكد من عمل backup أولاً!
rmdir /s /q "uploads"
```

## الحالة الحالية
- ✅ كل الملفات الجديدة تُحفظ في `saves/`
- ✅ الملفات القديمة منسوخة في `saves/`
- ✅ الروابط محدثة في الداتا بيز
- ✅ الكلاينت يدعم كلا المسارين (backward compatible)
- ✅ السيرفر شغال على `http://localhost:5000`

## اختبار
1. افتح المتصفح وادخل على الشات
2. أرسل صورة أو فويس جديد
3. يجب أن يُحفظ في `saves/` ويظهر للجميع
4. الملفات القديمة يجب أن تظهر بشكل طبيعي

---

**تاريخ التطبيق**: الآن
**الحالة**: ✅ مكتمل ويعمل
