const bcrypt = require('bcryptjs'); 
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { MongoClient, ObjectId } = require('mongodb-legacy');

const app = express();
const PORT = process.env.PORT || 3000;
const dbname = 'fisheries';

//setup for api
const API = "https://gateway.api.globalfishingwatch.org/v3";
const GFW_TOKEN = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImtpZEtleSJ9.eyJkYXRhIjp7Im5hbWUiOiJmaXNoZXJpZXMiLCJ1c2VySWQiOjc0NDExLCJhcHBsaWNhdGlvbk5hbWUiOiJmaXNoZXJpZXMiLCJpZCI6MTcyODQsInR5cGUiOiJ1c2VyLWFwcGxpY2F0aW9uIn0sImlhdCI6MTc5NDQxMzM5MSwiZXhwIjoyMTA5NzczMzkxLCJhdWQiOiJnZnciLCJpc3MiOiJnZncifQ.TAEx7UNieBPrzupRKklf7Uv_sNOTj9JpUPLm5yZM2Vy6HjBiALmxUTceXrGBJF3kzDdI8Pk5HS-l8wChsQ5ySK0hV9LM5ymXZPtASuoBp_d3Du0oAZzGN8M2kyLfWmjOaEVBXRlgAl_psNqfZTGBhritICEciS_0K-J1RfRiDuvn-aiPSxJvCRWKyjcC9FiBJgs0t_E3KYWaGf_tbVsGjGaucDER0qmIfEAR48VKVmiIUhUuwu90i_fG5q5NKdKqnVrK-agHB-nKRlRCyAh8By4i6pHwY3rm7HGkwJniSymQitGZcXo7nt7mhqeWEGPiDAe6cE2mBzsc6dmIF-Fl5cEz156mNdVWgAu9jO4RiVddddB84FBC54ZxASsWKohKcEtCgdW26LaS1Lzb22a3kodjvJjmrNx5SmkWEjiP8pmbZ1StXy3z6P7W01jsLO_gip1AN2K_Tyi5lqN7xhDwSDtqDHNAmVgOdZHbuWVKfBMXk2NkB8dbnXiCXYEqeNjt";

const VESSEL_DATASET = "public-global-vessel-identity:latest";
const FISHING_EFFORT_DATASET = "public-global-fishing-effort:latest";

let events = [];
let currentRequest = 0;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'view'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'fisheries-secret-key',
    resave: false,
    saveUninitialized: false
}));
app.use(flash());
app.use((req, res, next) => {
    res.locals.error_msg = req.flash('error_msg')[0];
    res.locals.success_msg = req.flash('success_msg')[0];
    next();
});

const client = new MongoClient('mongodb://localhost:27017');
let db;

//api route for vessel search
app.get('/api/vessels/search', async (req, res) => {
    //checks if the user is logged in
    if (!req.session.loggedin) {
        return res.status(401).json({ error: 'Please log in.' });
    }

    //checks if the user is searching for a string
    const query = typeof req.query.query === 'string'
        ? req.query.query.trim()
        : '';

    if (!query) {
        return res.status(400).json({ error: 'A search query is required.' });
    }

    //looks for a token stored as locan env variable
    const token = process.env.GFW_API_TOKEN || GFW_TOKEN;
    if (!token) {
        return res.status(500).json({ error: 'GFW API token is not configured.' });
    }

    //creates search request
    const params = new URLSearchParams({
        query,
        'datasets[0]': VESSEL_DATASET
    });

    //the actual request to the GFW API
    try {
        const response = await fetch(`${API}/vessels/search?${params}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok) {
            console.error('GFW API request failed:', response.status, data);
            return res.status(response.status).json({ error: 'Vessel search failed.' });
        }

        res.json(data);
    } catch (err) {
        console.error('Could not reach GFW API:', err);
        res.status(502).json({ error: 'Could not reach the vessel API.' });
    }
});

//api route for 4wings area-filtered fishing effort
app.post('/api/4wings/area', async (req, res) => {
    if (!req.session.loggedin) {
        return res.status(401).json({ error: 'Please log in.' });
    }

    const token = process.env.GFW_API_TOKEN || GFW_TOKEN;
    if (!token) {
        return res.status(500).json({ error: 'GFW API token is not configured.' });
    }

    const {
        minLat,
        minLng,
        maxLat,
        maxLng,
        startDate = '2025-09-01',
        endDate = '2025-09-15',
        resolution = 'LOW'
    } = req.body;

    const params = new URLSearchParams({
        'spatial-resolution': resolution,
        'temporal-resolution': 'DAILY',
        'group-by': 'FLAGANDGEARTYPE',
        'datasets[0]': FISHING_EFFORT_DATASET,
        'date-range': `${startDate},${endDate}`,
        'format': 'JSON'
    });

    const geojson = {
        type: 'Polygon',
        coordinates: [[
            [Number(minLng), Number(minLat)],
            [Number(maxLng), Number(minLat)],
            [Number(maxLng), Number(maxLat)],
            [Number(minLng), Number(maxLat)],
            [Number(minLng), Number(minLat)]
        ]]
    };

    try {
        const response = await fetch(`${API}/4wings/report?${params}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ geojson })
        });
        const data = await response.json();

        if (!response.ok) {
            console.error('GFW 4Wings request failed:', response.status, data);
            return res.status(response.status).json({ error: '4Wings area request failed.' });
        }

        res.json(data);
    } catch (err) {
        console.error('Could not reach GFW 4Wings API:', err);
        res.status(502).json({ error: 'Could not reach the 4Wings API.' });
    }
});


client.connect()
    .then(() => {
        db = client.db(dbname);
        console.log(`Connected to database: ${dbname}`);
    })
    .catch(err => console.error(err));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});


app.get('/', async (req, res) => {
  //if (!req.session.loggedin) return res.redirect('/');
  res.render('pages/index', { page: 'index', user: req.session.currentuser });
});
app.get('/signUp', async (req, res) => {
    res.render('pages/signup', { page: 'signup', user: req.session.currentuser });
});
app.get('/dashboard', async (req, res) => {
    if (!req.session.loggedin) return res.redirect('/');
    try {
        const users = await db.collection('users').find().toArray();
        res.render('pages/dashboard', { page: 'dashboard', user: req.session.currentuser, users });
    } catch (err) {
        console.error("❌ Error fetching users:", err);
        res.redirect('/');
    }
});


app.post('/login', async (req, res) => {
    if (!db) return res.status(503).send("Database connecting...");
    const { username, password } = req.body;
    try {
        const user = await db.collection('users').findOne({ "login.username": username });
        if (user && await bcrypt.compare(password, user.login.password)) {
            req.session.loggedin = true;
            req.session.currentuser = username;
            return res.redirect('/dashboard');
        }
        req.flash('error_msg', 'Invalid credentials');
        res.redirect('/');
    } catch (err) { res.redirect('/'); }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

app.post('/signUp', async (req, res) => {
    const { email, uname, psw } = req.body;
    try {
        const existingUser = await db.collection('users').findOne({ "login.username": uname });
        if (existingUser) {
            req.flash('error_msg', 'User already exists.');
            return res.redirect('/signUp');
        }
        const hash = await bcrypt.hash(psw, 10);
        await db.collection('users').insertOne({
            email,
            login: { username: uname, password: hash },
            created: new Date().toISOString().slice(0, 19)
        });
        req.session.loggedin = true;
        req.session.currentuser = uname;
        req.flash('success_msg', 'User created successfully.');
        res.redirect('/dashboard');
    } catch (err) {
        console.error("❌ Error creating user:", err);
        req.flash('error_msg', 'Error creating user.');
        res.redirect('/signUp');
    }
});
