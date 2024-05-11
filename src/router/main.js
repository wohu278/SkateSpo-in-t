const {Router} = require('express')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')

const router = Router()

async function connectBD() {

    const connection = await mysql.createConnection({

        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE

    })

    return connection

}

let user_regis = false

const nodemailer = require('nodemailer');


const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

router.get('/', (req, res) => {

    res.render('inicio')

})

router.get('/login', (req, res) => {

    res.render('login')

})

router.post('/login', async(req, res) => {

    const {username, pass} = req.body

    const connection = await connectBD()

    const [rows, fields] = await connection.execute('SELECT * FROM skate_users WHERE username = ?', [username])

    if(rows.length > 0) {

        const user = rows[0]
        const passMatch = await bcrypt.compare(pass, user.pass)

        if(passMatch) {

            user_regis = true
            currentUser = user.username
            currentEmail = user.email
            res.redirect('/')

        }

    }
    else {

        res.send("Datos incorrectos")

    }

})

router.get('/register', (req, res) => {

    res.render('register')

})

router.post('/register', async(req, res) => {

    const {username, email, pass} = req.body
    const encriptPass = await bcrypt.hash(pass, 10)
    const connection = await connectBD()

    await connection.execute('INSERT INTO skate_users (username, email, pass) VALUES (?,?,?)', [username, email, encriptPass])

    const mailOptions = {
        from: 'contactskatespoint@gmail.com',
        to: email,
        subject: 'Confirmación de registro',
        text: `Hola ${username}, tu cuenta ha sido creada correctamente en SkateSpo(in)t.
No es necesario que respondas a este correo
Disfruta de nuestro contenido ahora: http://localhost:3000/`
    };

    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Correo electrónico de confirmación enviado a: ' + email);
        }
    });

    res.redirect('/login')

})

router.get('/cuenta', (req, res) => {

    if(user_regis == true) {

        res.redirect('/cuenta/'+currentUser)

    }
    else {

        res.redirect('/login')

    }

})

router.get('/cuenta/:username', (req, res) => {

    if(user_regis == true) {

        const {username} = req.params
        res.render('cuenta', {username, currentEmail})

    }
    else {

        res.redirect('/login')

    }

})

router.get('/log_out', (req, res) => {

    user_regis = false

    res.redirect('/')

})

router.get('/new_pass', (req, res) => {

    if(user_regis == true) {

        res.redirect('/new_pass/'+currentUser)

    }
    else {

        res.sendStatus(403)

    }

})

router.get('/new_pass/:username', async(req, res) => {

    const {username} = req.params
    const connection = await connectBD()

    const [usuario] = await connection.execute('SELECT * FROM skate_users WHERE username = ?', [username])

    if(user_regis == true && username == currentUser) {

        res.render('new_pass', {username})

    }
    else {

        res.sendStatus(403)

    }

})

router.post('/new_pass/:username', async(req, res) => {

    const {username} = req.params
    const connection = await connectBD()

    const {pass} = req.body

    const encriptPass = await bcrypt.hash(pass, 10);
    await connection.execute('UPDATE skate_users SET pass = ? WHERE username = ?', [encriptPass, username]);


    const mailOptions = {
        from: 'contactskatespoint@gmail.com',
        to: currentEmail,
        subject: 'Cambio de contraseña',
        text: `Hola ${username}, le informamos de que su contraseña ha sido reestablecida`
    };

    transporter.sendMail(mailOptions, function(error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Correo electrónico de cambio de contraseña enviado a: ' + email);
        }
    });

    res.redirect('/')

})

router.use((req, res, next) => {

    res.status(404).render('404')
    next()

})

module.exports = router