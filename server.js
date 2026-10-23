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
const dbname = 'stockplus';

const client = new MongoClient('mongodb://localhost:27017', { useUnifiedTopology: true });
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