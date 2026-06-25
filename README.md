# 🎁 Gift Card App

A full-stack gift card management system built with Node.js, Express, and SQLite.

---

## 📁 Project Structure

```
giftcard-app/
├── server.js           ← Express backend + API routes
├── package.json        ← Dependencies
├── giftcards.db        ← SQLite database (auto-created on first run)
└── public/             ← Frontend HTML files (served by Express)
    ├── index.html          Home page
    ├── giftcard-balance.html  Check balance page
    ├── activate.html       Activate card page
    └── admin.html          Admin dashboard
```

---

## 🚀 Setup (step by step)

### 1. Install Node.js
Download and install from https://nodejs.org (choose the LTS version)

### 2. Open the project in VS Code
- Open VS Code
- Go to **File → Open Folder** and select the `giftcard-app` folder

### 3. Open the terminal in VS Code
- Press `` Ctrl + ` `` (backtick) to open the terminal

### 4. Install dependencies
```bash
npm install
```

### 5. Start the server
```bash
npm start
```

You should see:
```
✅  Gift Card Server running at http://localhost:3000
   Admin login: admin / admin123
```

### 6. Open the app
Visit **http://localhost:3000** in your browser.

---

## 🔗 Pages

| URL                                         | Page                  |
|---------------------------------------------|-----------------------|
| http://localhost:3000                       | Home                  |
| http://localhost:3000/giftcard-balance.html | Check Balance         |
| http://localhost:3000/activate.html         | Activate Card         |
| http://localhost:3000/admin.html            | Admin Dashboard       |

---

## 🔑 Default Admin Login

| Username | Password  |
|----------|-----------|
| admin    | admin123  |

> ⚠️ Change this before going live! Edit the `admins` table in the database or update the seed in `server.js`.

---

## 🧪 Demo Cards (pre-loaded)

| Card Number          | Balance  | Status   | PIN  |
|----------------------|----------|----------|------|
| 4111 1111 1111 1111  | $75.00   | Active   | 1234 |
| 5500 0000 0000 0004  | $0.00    | Inactive | 5678 |
| 3714 4963 5398 4310  | $200.50  | Active   | 9012 |
| 6011 1111 1111 1117  | $50.00   | Pending  | 3456 |

---

## 📡 API Endpoints

### Public
| Method | Route                  | Description         |
|--------|------------------------|---------------------|
| POST   | /api/auth/login        | Admin login         |
| POST   | /api/cards/balance     | Check card balance  |
| POST   | /api/cards/activate    | Activate a card     |

### Admin
| Method | Route                        | Description           |
|--------|------------------------------|-----------------------|
| GET    | /api/admin/cards             | List all cards        |
| POST   | /api/admin/cards             | Add a new card        |
| PATCH  | /api/admin/cards/:id         | Edit a card           |
| PATCH  | /api/admin/cards/:id/status  | Quick status toggle   |
| DELETE | /api/admin/cards/:id         | Delete a card         |

---

## 🔄 Auto-restart during development (optional)

Install nodemon for automatic server restarts when you edit files:
```bash
npm install -g nodemon
npm run dev
```
