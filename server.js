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