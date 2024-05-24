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

router.get('/blog', async(req, res) => {
    const connection = await connectBD()

    const [rows, fields] = await connection.execute('SELECT * FROM blog_posts')

    res.render('blog_posts', { blog_posts: rows, user_regis: user_regis }) // Asegúrate de pasar user_regis aquí
})


router.post('/favorite', async (req, res) => {
    if (!user_regis) {
        res.redirect('/login');
        return;
    }

    const { postId } = req.body;
    const connection = await connectBD();

    // Obtener el user_id del usuario actual
    const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
    const userId = userData[0].id;

    // Insertar el post favorito en la base de datos
    await connection.execute('INSERT INTO user_favorites (user_id, post_id) VALUES (?, ?)', [userId, postId]);

    res.redirect('/blog');
});

router.get('/post/:nombre', async(req, res) => {

    const {nombre} = req.params
    const connection = await connectBD()
    const [rows, fields] = await connection.execute("SELECT * FROM blog_posts WHERE nombre = ?", [nombre])
    const post = rows[0]

    const [comments] = await connection.execute("SELECT * FROM blog_comments WHERE post_id = ?", [post.id])

    res.render('post', {post, comments, user_regis})

})

router.post('/post/:nombre/comment', async(req, res) => {
    if (!user_regis) {
        res.redirect('/login');
        return;
    }

    const { nombre } = req.params;
    const { comentario } = req.body;
    const connection = await connectBD();

    // Obtener la información del post
    const [postInfo] = await connection.execute("SELECT id FROM blog_posts WHERE nombre = ?", [nombre]);
    const postId = postInfo[0].id;

    // Obtener el user_id del usuario actual
    const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
    const userId = userData[0].id;

    // Insertar el comentario en la base de datos
    await connection.execute('INSERT INTO blog_comments(post_id, user_id, username, comentario) VALUES (?,?,?,?)', [postId, userId, currentUser, comentario]);

    res.redirect(`/post/${nombre}`);
});



router.post('/post/:nombre/comment/:commentId/delete', async(req, res) => {
    const { nombre, commentId } = req.params;
    const connection = await connectBD();

    // Verifica si el comentario pertenece al usuario registrado
    const [comment] = await connection.execute('SELECT * FROM blog_comments WHERE id = ?', [commentId]);
    if (comment.length > 0 && comment[0].username === currentUser) {
        // Elimina el comentario si el usuario registrado es el propietario del comentario
        await connection.execute('DELETE FROM blog_comments WHERE id = ?', [commentId]);
    }

    res.redirect(`/post/${nombre}`);
});

router.get('/contacto', (req, res) => {

    res.render('contacto')

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

router.get('/cuenta/:username', async (req, res) => {
    if (user_regis && req.params.username === currentUser) {
        const connection = await connectBD();

        const [favorites] = await connection.execute(`
            SELECT bp.* FROM blog_posts bp
            JOIN user_favorites uf ON bp.id = uf.post_id
            WHERE uf.user_id = (SELECT id FROM skate_users WHERE username = ?)
        `, [currentUser]);

        res.render('cuenta', { username: currentUser, currentEmail, favorites });
    } else {
        res.redirect('/login');
    }
});


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