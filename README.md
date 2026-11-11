# Fisheries Dashboard (CM 3130)

A Node.js, Express, EJS, and MongoDB web application for collecting and analysing commercial fishing activity data using the Global Fishing Watch (GFW) platform.

---

## Prerequisites

Before running this project, make sure you have installed:
- **[Node.js](https://nodejs.org/)** (v18+ recommended)
- **[MongoDB Community Server](https://www.mongodb.com/try/download/community)** (running locally on `mongodb://localhost:27017`)

---

## Setup & Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd fisheries-
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   *(If any packages are missing, run:)*
   ```bash
   npm install express ejs express-session connect-flash body-parser bcryptjs multer xlsx node-cron nodemailer mongodb mongodb-legacy
   ```

3. **Make sure MongoDB is running**
   - Ensure your local MongoDB service is active on `mongodb://localhost:27017`.
   - The server will automatically create and connect to the `fisheries` database on startup.

4. **Start the server**
   ```bash
   npm start
   ```
   *(Or run `node server.js` directly.)*

5. **Open in your browser**
   - Visit **`http://localhost:3000`**
   - Click **Sign Up** (`/signUp`) to create a local user account, which will log you straight into the **Dashboard** (`/dashboard`).

---

## Project Structure

```text
fisheries-/
├── public/
│   ├── scripts/
│   │   └── main.js          # Frontend JavaScript (ready for map / API logic)
│   └── style/
│       └── main.css         # Stylesheet for login, sign-up, and dashboard
├── view/
│   ├── pages/
│   │   ├── index.ejs        # Login page (/)
│   │   ├── signup.ejs       # User registration page (/signUp)
│   │   ├── dashboard.ejs    # Main dashboard layout & placeholders (/dashboard)
│   │   └── map.ejs          # Standalone map template
│   └── partials/
│       └── footer.ejs       # Shared EJS partial
├── server.js                # Express server, MongoDB connection, and auth routes
└── package.json             # Project dependencies
```

---

## Notes for Teammates (Adding the GFW API)

The dashboard UI and authentication are set up and ready for API integration:
- **Backend (`server.js`)**: Add your Global Fishing Watch API routes at the bottom of `server.js` using the existing `db` MongoDB connection.
- **Dashboard View (`view/pages/dashboard.ejs`)**:
  - KPI values can be populated via IDs: `#kpi-vessels`, `#kpi-hours`, `#kpi-gear`, and `#kpi-pending`.
  - Replace `#map-placeholder` with your map container (e.g., Leaflet or GFW embed) and populate `#vessel-tbody` with the returned records.
- **Frontend Script (`public/scripts/main.js`)**: Already linked at the bottom of `dashboard.ejs` for client-side fetching, map rendering, and offline caching.
