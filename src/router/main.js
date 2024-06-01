const {Router} = require('express')
const mysql = require('mysql2/promise')
const bcrypt = require('bcryptjs')
const nodemailer = require('nodemailer');
require('dotenv').config();

const router = Router()

async function connectBD() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_DATABASE
        });
        console.log('Connected to the database');
        return connection;
    } catch (error) {
        console.error('Error connecting to the database:', error.code);
        console.error('Error details:', error);
        throw error;
    }
}

let user_regis = false
let currentEmail = ''
let currentUser = ''

console.log("OK");

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

router.get('/blog', async (req, res) => {
    let connection;
    try {
        connection = await connectBD();
        const [rows] = await connection.execute('SELECT * FROM blog_posts');
        
        let userId
        if (user_regis) {
            const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
            userId = userData[0].id;
        }

        // Obtener la lista de favoritos del usuario si está registrado
        let favorites = [];
        if (userId) {
            const [userFavorites] = await connection.execute('SELECT post_id FROM user_favorites WHERE user_id = ?', [userId]);
            favorites = userFavorites.map(favorite => favorite.post_id);
        }

        res.render('blog_posts', { blog_posts: rows, user_regis, favorites });
    } catch (error) {
        console.error('Error fetching blog posts', error);
        res.status(500).send('Error fetching blog posts');
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});



// Ruta para agregar un post a favoritos
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

    // Verificar si el post ya está en la lista de favoritos del usuario
    const [existingFavorite] = await connection.execute('SELECT * FROM user_favorites WHERE user_id = ? AND post_id = ?', [userId, postId]);
    if (existingFavorite.length > 0) {
        // El post ya está en la lista de favoritos, no es necesario añadirlo de nuevo
        res.redirect('/blog');
        return;
    }

    // Insertar el post favorito en la base de datos
    await connection.execute('INSERT INTO user_favorites (user_id, post_id) VALUES (?, ?)', [userId, postId]);

    res.redirect('/blog');
});


// Ruta para eliminar un post favorito
router.post('/favorite/delete/:postId', async (req, res) => {
    if (!user_regis) {
        res.redirect('/login');
        return;
    }

    const { postId } = req.params;
    const connection = await connectBD();

    // Obtener el user_id del usuario actual
    const [userData] = await connection.execute('SELECT id FROM skate_users WHERE username = ?', [currentUser]);
    const userId = userData[0].id;

    // Eliminar el post favorito de la base de datos
    await connection.execute('DELETE FROM user_favorites WHERE user_id = ? AND post_id = ?', [userId, postId]);

    res.redirect('/cuenta');
});


router.get('/post/:nombre', async(req, res) => {

    const {nombre} = req.params
    const connection = await connectBD()
    const [rows, fields] = await connection.execute("SELECT * FROM blog_posts WHERE nombre = ?", [nombre])
    if (!rows || rows.length === 0) {
        console.error('No se encontraron publicaciones con el nombre proporcionado');
        // Manejar el caso en el que no se encuentran publicaciones con el nombre proporcionado
        return res.status(404).send('No se encontraron publicaciones con el nombre proporcionado');
    }
    const post = rows[0]

    const [comments] = await connection.execute("SELECT * FROM blog_comments WHERE post_id = ?", [post.id])

    res.render('post', {post, comments, user_regis, currentUser})

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

router.get('/ayuda', (req, res) => {

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
        else{

            res.status(400).render('datosIncorrectos')

        }

    }
    else {

        res.status(400).render('datosIncorrectos')

    }

})

router.get('/register', (req, res) => {

    res.render('register')

})

router.post('/register', async(req, res) => {
    const { username, email, pass, confirmPass } = req.body;
    const encriptPass = await bcrypt.hash(pass, 10);
    const connection = await connectBD();

    if(pass != confirmPass) {

        return res.status(400).render('contraseñaIncorrecta')

    }

    // Verificar si el correo electrónico o el nombre de usuario ya están registrados
    const [existingUser] = await connection.execute('SELECT * FROM skate_users WHERE email = ? OR username = ?', [email, username]);
    if (existingUser.length > 0) {
        // Si el correo electrónico o el nombre de usuario ya están en uso, enviar una respuesta de error correspondiente
        if (existingUser[0].email === email) {
            return res.status(400).render('emailRegistrado');
        } else {
            return res.status(400).render('usuarioRegistrado')
        }
    }

    await connection.execute('INSERT INTO skate_users (username, email, pass) VALUES (?,?,?)', [username, email, encriptPass]);

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

    res.redirect('/login');
});


router.get('/cuenta', (req, res) => {

    if(user_regis) {

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

    if(user_regis) {

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

router.post('/new_pass/:username', async (req, res) => {
    const { username } = req.params;
    const { pass } = req.body;
    const connection = await connectBD();
    const encriptPass = await bcrypt.hash(pass, 10);
    await connection.execute('UPDATE skate_users SET pass = ? WHERE username = ?', [encriptPass, username]);

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: currentEmail,
        subject: 'Cambio de contraseña',
        text: `Hola ${username}, le informamos de que su contraseña ha sido cambiada`
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Correo electrónico de confirmación enviado a: ' + currentEmail);
        }
    });

    res.redirect('/cuenta');
});

router.use((req, res, next) => {

    res.status(404).render('404')
    next()

})

module.exports = router