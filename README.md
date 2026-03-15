# Company Intel — הוראות התקנה

## מבנה הפרויקט
```
company-intel/
├── src/
│   └── server.js       ← השרת (Node.js)
├── public/
│   └── index.html      ← הממשק
├── .env                ← המפתחות (לא עולה ל-Git!)
├── .gitignore
└── package.json
```

---

## שלב 1 — Google Sheets

1. פתחי את קובץ ה-Excel שלך ב-Google Sheets
2. File → Share → **Publish to web**
3. בחרי: **Sheet1** → **Comma-separated values (.csv)**
4. לחצי **Publish** → העתיקי את הקישור
5. הדביקי אותו ב-`.env` תחת `GOOGLE_SHEETS_URL`

> חשוב: ה-Sheet צריך להיות ציבורי (published), לא רק shared.

---

## שלב 2 — .env

פתחי את קובץ `.env` ומלאי:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
GOOGLE_SHEETS_URL=https://docs.google.com/spreadsheets/d/XXXX/export?format=csv
PORT=3000
```

---

## שלב 3 — התקנה והרצה ב-Cursor

פתחי Terminal ב-Cursor (Ctrl+`) והרצי:

```bash
npm install
npm run dev
```

פתחי בדפדפן: **http://localhost:3000**

---

## עדכון הנתונים

כל שינוי ב-Google Sheets יתעדכן אוטומטית תוך **5 דקות** (cache TTL).
אם רוצה עדכון מיידי — פשוט הפעילי מחדש את השרת.

---

## טיפים

- `npm run dev` — מפעיל עם nodemon (רענון אוטומטי בשינוי קוד)
- `npm start` — הפעלה רגילה ללא nodemon
- השרת שומר cache של ה-DB כדי לא לפנות ל-Sheets בכל בקשה
